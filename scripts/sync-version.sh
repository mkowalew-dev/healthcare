#!/usr/bin/env bash
#
# sync-version.sh — keep package.json versions in sync with CHANGELOG.md
#
# CHANGELOG.md is the single source of truth. This script reads the most recent
# release heading (the first `## [X.Y.Z]` line) and writes that version into the
# top-level "version" field of every tracked package.json.
#
# Usage:
#   ./scripts/sync-version.sh          # apply: rewrite package.json versions
#   ./scripts/sync-version.sh --check  # verify only: exit 1 on mismatch, no writes
#
# Run automatically by the pre-commit hook (.githooks/pre-commit). To enable that
# hook in a fresh clone, run once:  git config core.hooksPath .githooks
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

CHANGELOG="CHANGELOG.md"
PACKAGE_FILES=(frontend/package.json backend/package.json)

if [[ ! -f "$CHANGELOG" ]]; then
  echo "sync-version: $CHANGELOG not found" >&2
  exit 1
fi

# First heading of the form: ## [2.4.1] — 2026-07-04
VERSION="$(grep -m1 -oE '^## \[[0-9]+\.[0-9]+\.[0-9]+\]' "$CHANGELOG" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || true)"
if [[ -z "$VERSION" ]]; then
  echo "sync-version: could not find a '## [X.Y.Z]' heading in $CHANGELOG" >&2
  exit 1
fi

MODE="${1:-apply}"
mismatch=0

for f in "${PACKAGE_FILES[@]}"; do
  [[ -f "$f" ]] || continue
  # Read the top-level "version" field (first "version": occurrence).
  current="$(grep -m1 -oE '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$f" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || true)"
  if [[ "$current" == "$VERSION" ]]; then
    continue
  fi

  if [[ "$MODE" == "--check" ]]; then
    echo "sync-version: MISMATCH $f is '$current', CHANGELOG is '$VERSION'" >&2
    mismatch=1
    continue
  fi

  # Replace only the FIRST "version": line (the package's own version — dependency
  # entries use "<name>": "<range>", so the literal "version" key is unambiguous).
  awk -v v="$VERSION" '
    BEGIN { done = 0 }
    !done && /"version"[[:space:]]*:[[:space:]]*"[^"]*"/ {
      sub(/"version"[[:space:]]*:[[:space:]]*"[^"]*"/, "\"version\": \"" v "\"")
      done = 1
    }
    { print }
  ' "$f" > "$f.tmp" && mv "$f.tmp" "$f"
  echo "sync-version: $f ${current:-?} -> $VERSION"
done

if [[ "$MODE" == "--check" && "$mismatch" -ne 0 ]]; then
  echo "sync-version: run ./scripts/sync-version.sh to fix" >&2
  exit 1
fi
