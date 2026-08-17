#!/usr/bin/env sh
# The repository has one author. This history will be read commit by commit, and a trailer
# added on a tired evening is not fixable without rewriting it.
set -eu

if grep -qiE '^[[:space:]]*Co-Authored-By:' "$1"; then
  echo "commit-msg: Co-Authored-By trailer is not allowed in this repository." >&2
  exit 1
fi
