#!/usr/bin/env bash
#
# check-depersonalization.sh — pre-commit guard against leaking Dan's personal
# literals back into the distributable fork.
#
# Scans staged files for known personal identifiers from canonical
# claude-assistant that should never land in claude-chief-of-staff. Intended
# to run as a pre-commit hook; exits non-zero (blocks commit) on match.
#
# Usage (manual):
#   ./scripts/check-depersonalization.sh
#
# Usage (as pre-commit hook — recommended one-time setup):
#   git config core.hooksPath scripts/git-hooks
#   # Or copy into .git/hooks/pre-commit for this clone only.
#
# Patterns guarded:
#   - "Dan Guilliams"                    — author name in prompts/docs
#   - "Astral Insights"                  — company affiliation in prompts
#   - "danguilliams.com"                 — personal domains (cos-tunnel.*, etc.)
#   - "5ec470d1-cb13-4775-93ec-7d68bd41c7aa" — canonical's real D1 database UUID
#
# Exits 0 on clean; exits 1 with a listing on matches.
#
# See: RUN-20260416-0955 FINDINGS.md — depersonalization-audit gap that
# motivated this guard.

set -euo pipefail

# Whitelist: files that MAY legitimately contain the patterns (e.g., the
# guard script itself documenting the patterns, or meta docs describing
# depersonalization).
WHITELIST=(
  "scripts/check-depersonalization.sh"
)

# Regex union of forbidden patterns.
FORBIDDEN='Dan Guilliams|Astral Insights|danguilliams\.com|5ec470d1-cb13-4775-93ec-7d68bd41c7aa|\bDAN_[A-Z_]+|Guilliams'

# Files staged for commit (added, copied, modified, renamed). Exclude deletes.
staged_files=$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null || true)

if [[ -z "$staged_files" ]]; then
  # Nothing staged — nothing to check.
  exit 0
fi

violations=""

while IFS= read -r file; do
  # Skip whitelisted paths.
  skip=0
  for wl in "${WHITELIST[@]}"; do
    if [[ "$file" == "$wl" ]]; then skip=1; break; fi
  done
  if [[ "$skip" -eq 1 ]]; then continue; fi

  # Skip binary files.
  if ! git diff --cached --name-only --diff-filter=ACMR -- "$file" | grep -q .; then continue; fi
  if file "$file" 2>/dev/null | grep -q binary; then continue; fi

  # Check the staged content (not working-tree content) for forbidden patterns.
  matches=$(git show ":$file" 2>/dev/null | grep -n -E "$FORBIDDEN" || true)
  if [[ -n "$matches" ]]; then
    violations+="\n$file:\n$matches\n"
  fi
done <<< "$staged_files"

if [[ -n "$violations" ]]; then
  printf '\n\033[31m%s\033[0m\n' "╔════════════════════════════════════════════════════════════════╗"
  printf '\033[31m%s\033[0m\n' "║  DEPERSONALIZATION GUARD — COMMIT BLOCKED                      ║"
  printf '\033[31m%s\033[0m\n' "╚════════════════════════════════════════════════════════════════╝"
  printf '\nStaged files contain personal literals that should NOT ship in the\n'
  printf 'distributable fork (see scripts/check-depersonalization.sh).\n'
  printf '\nViolations:\n'
  printf '%b\n' "$violations"
  printf '\nFix: remove or depersonalize the flagged content, then re-stage.\n'
  printf 'Or (rare) whitelist the file in scripts/check-depersonalization.sh\n'
  printf 'if the reference is intentional (e.g., documenting the patterns).\n\n'
  exit 1
fi

exit 0
