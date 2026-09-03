#!/usr/bin/env bash
# The nightly reset of ADR-0032: a restricted local `pg_dump`, pending migrations, then the
# deterministic seed as a one-shot container. The seed's own transaction is the reset boundary —
# on failure it rolls its own changes back and the last complete dataset stays readable, which is
# why this script does not attempt a second, separate rollback of its own.
#
# Root-owned, run only by deploy/systemd/erp-reset.timer via erp-reset.service (ADR-0030). Deploys
# and resets never race by construction: both take the same flock on $STATE_DIR/deploy.lock, so a
# reset mid-deploy waits rather than reading a half-migrated schema, and vice versa.
set -euo pipefail

DOCKER="${DOCKER:-docker}"
IMAGE="${IMAGE:-ghcr.io/clementvallois/maquette-erp}"
STATE_DIR="${STATE_DIR:-/var/lib/erp-deploy}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/erp-maquette}"
COMPOSE_FILE="${COMPOSE_FILE:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/compose.prod.yml}"
ENV_FILE="${ENV_FILE:-/etc/erp-maquette/environment}"

CURRENT_DIGEST_FILE="$STATE_DIR/current-digest"

compose() {
  "$DOCKER" compose --project-directory "$(dirname "$COMPOSE_FILE")" -f "$COMPOSE_FILE" \
    --env-file "$ENV_FILE" "$@"
}

exec 9>"$STATE_DIR/deploy.lock"
flock 9 # blocking: wait out a concurrent deploy rather than reading a half-migrated schema.

current_digest="$(cat "$CURRENT_DIGEST_FILE" 2>/dev/null || true)"
if [ -z "$current_digest" ]; then
  echo "no digest on record in $CURRENT_DIGEST_FILE — nothing deployed yet, nothing to reset" >&2
  exit 1
fi

# Compose interpolates every `${VAR}` in compose.prod.yml on ANY subcommand, including `exec`
# targeting only postgres — not just the services a given call touches. app/migrate/seed all
# declare `image: ${IMAGE_REF:?…}`, so exporting it once here (rather than prefixing only the
# `run --rm` calls below) is what keeps the `pg_dump` line below from refusing to start at all.
export IMAGE_REF="$IMAGE@$current_digest"

# Seven daily rotations (ADR-0032), keyed by ISO weekday (1 Monday .. 7 Sunday) so each week
# overwrites its own slot instead of growing without bound.
install -d -m 0700 "$BACKUP_DIR"
dump_file="$BACKUP_DIR/erp-$(date -u +%u).dump"
echo "dumping to $dump_file"
compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom \
  >"$dump_file.tmp"
mv "$dump_file.tmp" "$dump_file" # atomic: a failed pg_dump never overwrites a good rotation slot.

echo "migrating"
compose run --rm migrate

echo "reseeding"
compose run --rm seed

echo "reset complete against $current_digest"
