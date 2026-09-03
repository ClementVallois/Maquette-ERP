#!/usr/bin/env bash
# A recording stub standing in for the `docker` binary in deploy/test/dry-run.sh. It answers only
# `buildx imagetools inspect` — the one registry-only read --dry-run is allowed to make — and logs
# every invocation's argv to $DOCKER_STUB_LOG so the test can assert what did NOT run. Any other
# subcommand is a defect in --dry-run's own promise (ADR-0029: it does not pull, migrate, restart,
# write digest state, or take a backup), so it is recorded and then refused.
set -euo pipefail

: "${DOCKER_STUB_LOG:?fake-docker.sh requires DOCKER_STUB_LOG}"
: "${DOCKER_STUB_DIGEST:?fake-docker.sh requires DOCKER_STUB_DIGEST}"

printf '%s\n' "$*" >>"$DOCKER_STUB_LOG"

if [ "${1:-}" = 'buildx' ] && [ "${2:-}" = 'imagetools' ] && [ "${3:-}" = 'inspect' ]; then
  cat <<EOF
Name:      $4
MediaType: application/vnd.oci.image.index.v1+json
Digest:    $DOCKER_STUB_DIGEST
EOF
  exit 0
fi

echo "fake-docker.sh: unexpected invocation for a --dry-run test: $*" >&2
exit 1
