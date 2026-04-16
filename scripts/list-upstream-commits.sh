#!/usr/bin/env bash
#
# list-upstream-commits.sh — list canonical commits not yet ported to this fork.
#
# Purpose:
#   Fork was branched as a fresh `git init`; canonical is tracked locally as
#   `canonical` remote but never pushed. This script lists canonical commits
#   that haven't been referenced in a fork commit message, grouped by prefix
#   (fix: / feat: / docs: / chore:).
#
# Setup (one-time per clone):
#   git remote add canonical <path-or-url>
#   git fetch canonical main
#
# Usage:
#   ./scripts/list-upstream-commits.sh                  # all pending
#   ./scripts/list-upstream-commits.sh --since 2w       # last 2 weeks only
#   ./scripts/list-upstream-commits.sh --grep fix       # only fix: commits
#
# Output:
#   - groups by conventional-commit prefix
#   - marks commits that appear referenced in fork commit messages as PORTED
#   - marks unreferenced commits as PENDING (candidate for triage)

set -euo pipefail

SINCE=""
GREP_FILTER=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --since) SINCE="--since=$2"; shift 2 ;;
    --grep) GREP_FILTER="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if ! git remote | grep -q '^canonical$'; then
  cat <<EOF >&2
ERROR: canonical remote not configured.

Run this first:
  git remote add canonical <path-or-url-to-claude-assistant>
  git fetch canonical main
EOF
  exit 1
fi

echo "Fetching canonical..."
git fetch canonical main --quiet

FORK_MSGS=$(mktemp)
trap 'rm -f "$FORK_MSGS"' EXIT
git log --format='%B' > "$FORK_MSGS"

PENDING=""
PORTED=""

while IFS=$'\t' read -r sha subject; do
  if [[ -n "$GREP_FILTER" ]] && ! grep -qE "^${GREP_FILTER}:" <<< "$subject"; then
    continue
  fi
  if grep -q "$sha" "$FORK_MSGS"; then
    PORTED+="$sha $subject"$'\n'
  else
    PENDING+="$sha $subject"$'\n'
  fi
done < <(git log canonical/main $SINCE --format='%h%x09%s')

echo ""
echo "=== PENDING (no fork commit references the SHA) ==="
if [[ -z "$PENDING" ]]; then
  echo "  (none)"
else
  for prefix in fix feat docs chore test; do
    matches=$(echo "$PENDING" | grep -E "^[a-f0-9]+ ${prefix}:" || true)
    if [[ -n "$matches" ]]; then
      echo ""
      echo "  [${prefix}:]"
      echo "$matches" | sed 's/^/    /'
    fi
  done
  other=$(echo "$PENDING" | grep -vE "^[a-f0-9]+ (fix|feat|docs|chore|test):" || true)
  if [[ -n "$other" ]]; then
    echo ""
    echo "  [other]"
    echo "$other" | sed 's/^/    /'
  fi
fi

echo ""
echo "=== PORTED (fork commit references the SHA) ==="
if [[ -z "$PORTED" ]]; then
  echo "  (none)"
else
  echo "$PORTED" | sed 's/^/  /' | head -30
  count=$(echo "$PORTED" | grep -c . || true)
  if [[ "$count" -gt 30 ]]; then
    echo "  ... ($((count - 30)) more)"
  fi
fi

echo ""
echo "Triage pending commits per docs/UPSTREAM_SYNC.md and update its ledger."
