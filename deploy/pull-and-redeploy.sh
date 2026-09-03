#!/usr/bin/env bash
# Pull-based redeploy (ADR-0029). Resolves the pinned tag's current digest on GHCR without
# pulling it, and — only if that digest differs from the last one successfully deployed — runs
# pending migrations as a one-shot container holding the schema-owner credential, then swaps the
# long-running app container onto the new digest and waits for /readyz. A failed readiness check
# redeploys the digest this run displaced; nothing here ever deploys by the moving `:main` tag.
#
# Root-owned, invoked by the systemd units in deploy/systemd/ (ADR-0030) — `erp-deploy` may start
# those units, and never runs this script directly with a substituted command or environment.
#
# --dry-run resolves and prints the transition; it must not pull, migrate, restart, write digest
# state, or take a backup (ADR-0029's own five words for what dry-run does not do). Every external
# effect below goes through the `$DOCKER` command, overridable so `deploy/test/dry-run.sh` can
# assert those five absences against a recording stub instead of a real daemon.
# --rollback redeploys the recorded previous digest through the same function, not a second path.
set -euo pipefail

DOCKER="${DOCKER:-docker}"
IMAGE="${IMAGE:-ghcr.io/clementvallois/maquette-erp}"
IMAGE_TAG="${IMAGE_TAG:-main}"
STATE_DIR="${STATE_DIR:-/var/lib/erp-deploy}"
COMPOSE_FILE="${COMPOSE_FILE:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/compose.prod.yml}"
ENV_FILE="${ENV_FILE:-/etc/erp-maquette/environment}"
APP_PORT="${APP_PORT:-3000}"
READY_URL="${READY_URL:-http://127.0.0.1:${APP_PORT}/readyz}"
READY_RETRIES="${READY_RETRIES:-30}"
READY_INTERVAL="${READY_INTERVAL:-2}"

CURRENT_DIGEST_FILE="$STATE_DIR/current-digest"
PREVIOUS_DIGEST_FILE="$STATE_DIR/previous-digest"

usage() {
  echo "usage: $(basename "$0") [--dry-run|--rollback]" >&2
  exit 64 # EX_USAGE, sysexits.h
}

DRY_RUN=0
ROLLBACK=0
case "${1:-}" in
  '') ;;
  --dry-run) DRY_RUN=1 ;;
  --rollback) ROLLBACK=1 ;;
  *) usage ;;
esac
[ $# -le 1 ] || usage

compose() {
  "$DOCKER" compose --project-directory "$(dirname "$COMPOSE_FILE")" -f "$COMPOSE_FILE" \
    --env-file "$ENV_FILE" "$@"
}

read_state() {
  [ -f "$1" ] && cat "$1" || true
}

# Registry-only read: `imagetools inspect` talks to the registry API and never touches the local
# image cache, which is what keeps --dry-run from pulling (ADR-0029's first listed absence).
resolve_remote_digest() {
  "$DOCKER" buildx imagetools inspect "$IMAGE:$IMAGE_TAG" 2>/dev/null \
    | awk '/^Digest:/ { print $2; exit }'
}

wait_for_ready() {
  local attempt
  for attempt in $(seq 1 "$READY_RETRIES"); do
    if curl --silent --fail --output /dev/null "$READY_URL"; then
      return 0
    fi
    sleep "$READY_INTERVAL"
  done
  return 1
}

# Migrates then swaps the app container onto $1, waits for readiness, and records digest state on
# success. On a failed readiness check it redeploys the digest this call displaced — recursing
# once, never twice ($2 marks a recovery attempt so a rollback that also fails just reports it.
deploy_digest() {
  local target="$1"
  local is_recovery="${2:-0}"
  local displaced
  displaced="$(read_state "$CURRENT_DIGEST_FILE")"

  echo "deploying $target (displacing ${displaced:-<none>})"

  IMAGE_REF="$IMAGE@$target" compose up -d --wait postgres
  # The schema-owner credential (MIGRATION_DATABASE_URL) lives only in these one-shot containers'
  # environment — compose.prod.yml's `app` service never lists that variable (ADR-0030).
  IMAGE_REF="$IMAGE@$target" compose run --rm migrate
  if [ -z "$displaced" ]; then
    # No digest was ever recorded: this is the first deployment ever made, so ADR-0032's bootstrap
    # applies — seed before the application takes traffic. Every later deploy migrates only; the
    # nightly reset timer (deploy/nightly-reset.sh) owns reseeding from here on.
    echo "no digest on record — seeding the first deployment"
    IMAGE_REF="$IMAGE@$target" compose run --rm seed
  fi
  IMAGE_REF="$IMAGE@$target" compose up -d --no-deps app

  if wait_for_ready; then
    mkdir -p "$STATE_DIR"
    [ -n "$displaced" ] && echo "$displaced" >"$PREVIOUS_DIGEST_FILE"
    echo "$target" >"$CURRENT_DIGEST_FILE"
    echo "deployed $target"
    return 0
  fi

  echo "readiness check failed for $target" >&2
  if [ "$is_recovery" -eq 1 ]; then
    echo "the recovery redeploy of $target also failed readiness — manual intervention required" >&2
    return 1
  fi
  if [ -z "$displaced" ]; then
    echo "no previous digest recorded — nothing to restore automatically" >&2
    return 1
  fi
  echo "restoring the displaced digest $displaced"
  deploy_digest "$displaced" 1
  return 1 # the intended deploy to $target still failed, whether or not recovery succeeded
}

mkdir -p "$STATE_DIR"
exec 9>"$STATE_DIR/deploy.lock"
flock -n 9 || {
  echo "another deploy or rollback is already running" >&2
  exit 1
}

if [ "$ROLLBACK" -eq 1 ]; then
  previous="$(read_state "$PREVIOUS_DIGEST_FILE")"
  if [ -z "$previous" ]; then
    echo "no previous digest recorded in $PREVIOUS_DIGEST_FILE — nothing to roll back to" >&2
    exit 1
  fi
  deploy_digest "$previous"
  exit $?
fi

remote_digest="$(resolve_remote_digest)"
if [ -z "$remote_digest" ]; then
  echo "could not resolve $IMAGE:$IMAGE_TAG's digest from the registry" >&2
  exit 1
fi

current_digest="$(read_state "$CURRENT_DIGEST_FILE")"

if [ "$remote_digest" = "$current_digest" ]; then
  echo "up to date at $current_digest"
  exit 0
fi

if [ "$DRY_RUN" -eq 1 ]; then
  echo "[dry-run] would redeploy: ${current_digest:-<none>} -> $remote_digest"
  exit 0
fi

deploy_digest "$remote_digest"
