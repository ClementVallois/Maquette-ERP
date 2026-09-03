#!/usr/bin/env bash
# The dry-run assertion `docs/BUILD-PLAN.md`'s TDD table owes deploy scripts: "a dry-run assertion
# where one exists". Runs `pull-and-redeploy.sh --dry-run` against `fake-docker.sh` and checks
# ADR-0029's own five words for what dry-run must not do — pull, migrate, restart, write digest
# state, take a backup — rather than only checking the process exits 0, which a script that did
# all five and then exited 0 would also pass.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

export DOCKER="$here/fake-docker.sh"
export DOCKER_STUB_LOG="$work_dir/docker-invocations.log"
export DOCKER_STUB_DIGEST='sha256:1111111111111111111111111111111111111111111111111111111111111111'
: >"$DOCKER_STUB_LOG"

export STATE_DIR="$work_dir/state"
export ENV_FILE="$work_dir/environment" # never read on the dry-run path; asserted below
export COMPOSE_FILE="$here/../compose.prod.yml"

fail() {
  echo "FAIL: $1" >&2
  echo '--- docker invocations recorded ---' >&2
  cat "$DOCKER_STUB_LOG" >&2
  exit 1
}

"$here/../pull-and-redeploy.sh" --dry-run || fail 'exited non-zero'

grep -qE '^buildx imagetools inspect ' "$DOCKER_STUB_LOG" ||
  fail 'never resolved the remote digest — the test proves nothing if this did not run'

# ADR-0029's five absences, checked against what actually ran and what actually exists on disk —
# not inferred from the exit code.
grep -qE '(^| )pull( |$)' "$DOCKER_STUB_LOG" && fail 'dry-run pulled an image'
grep -qE '(^| )run( |$)' "$DOCKER_STUB_LOG" && fail 'dry-run ran a container (would be the migrate step)'
grep -qE '(^| )up( |$)' "$DOCKER_STUB_LOG" && fail 'dry-run started or restarted a service'
[ -f "$STATE_DIR/current-digest" ] && fail 'dry-run wrote current-digest state'
[ -f "$STATE_DIR/previous-digest" ] && fail 'dry-run wrote previous-digest state'
find "$work_dir" -iname '*.dump' -o -iname '*.sql.gz' 2>/dev/null | grep -q . &&
  fail 'dry-run left something that looks like a backup'

echo 'ok: --dry-run resolved the digest and did none of pull, migrate, restart, write state, or backup'
