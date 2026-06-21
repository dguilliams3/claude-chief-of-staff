#!/usr/bin/env bash
#
# preflight.sh — verify config completeness before deploy / trigger.
#
# Runs a series of static checks that catch common setup errors before
# they cause runtime failures:
#   - Required env vars set in .env
#   - local/ override files present for configured briefing types
#   - server/worker/wrangler.toml has no remaining YOUR_* placeholders
#   - Depersonalization guard is installed
#   - Node modules installed in all workspaces
#
# Exits 0 on clean, non-zero with a summary on issues.
#
# Usage:
#   npm run preflight       # via package.json script
#   ./scripts/preflight.sh  # direct

set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

ERRORS=()
WARNINGS=()

# --- Required env vars (.env) -------------------------------------------------

if [[ ! -f .env ]]; then
  ERRORS+=(".env not found. Copy .env.example → .env and fill in values.")
else
  # shellcheck disable=SC1091
  source .env 2>/dev/null || true

  if [[ -z "${COS_TOKEN:-}" ]]; then
    ERRORS+=("COS_TOKEN not set in .env (required — generate via: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\")")
  fi

  if [[ -z "${COS_WORKER_URL:-}" ]]; then
    ERRORS+=("COS_WORKER_URL not set in .env (required — your Worker deployment URL)")
  fi
fi

# --- Wrangler config placeholders --------------------------------------------

if [[ -f server/worker/wrangler.toml ]]; then
  if grep -qE 'YOUR_WORKER_NAME|YOUR_TUNNEL_URL|YOUR_D1_DATABASE_ID|YOUR_D1_DATABASE_NAME|YOUR_R2_BUCKET_NAME|YOUR_CUSTOM_DOMAIN' server/worker/wrangler.toml; then
    ERRORS+=("server/worker/wrangler.toml still contains YOUR_* placeholders — run /setup-instance Phase 2 or fill manually")
  fi
else
  ERRORS+=("server/worker/wrangler.toml not found. Copy wrangler.toml.example → wrangler.toml and fill in values.")
fi

# --- Local override structure ------------------------------------------------

if [[ ! -d local ]]; then
  WARNINGS+=("local/ directory not found — no per-instance overrides will load. Run /setup-instance Phase 7 to configure.")
fi

# Feeds check — community briefings need local/feeds.json
if [[ ! -f local/feeds.json ]]; then
  WARNINGS+=("local/feeds.json not found — community briefings will run with zero feed items until configured.")
else
  # Basic JSON validity
  if ! node -e "JSON.parse(require('fs').readFileSync('local/feeds.json', 'utf8'))" 2>/dev/null; then
    ERRORS+=("local/feeds.json is not valid JSON")
  fi
fi

# --- Depersonalization guard wired up? ---------------------------------------

HOOKS_PATH=$(git config --get core.hooksPath || echo "")
if [[ "$HOOKS_PATH" != "scripts/git-hooks" ]]; then
  WARNINGS+=("git core.hooksPath is not 'scripts/git-hooks' — depersonalization pre-commit guard won't fire. Fix: git config core.hooksPath scripts/git-hooks")
fi

if [[ ! -x scripts/check-depersonalization.sh ]]; then
  ERRORS+=("scripts/check-depersonalization.sh missing or not executable")
fi

# --- Node modules present? ---------------------------------------------------

if [[ ! -d node_modules ]]; then
  ERRORS+=("node_modules not found at repo root. Run: npm install")
fi

# --- Report ------------------------------------------------------------------

printf '\n=== Preflight Report ===\n\n'

if [[ ${#ERRORS[@]} -eq 0 && ${#WARNINGS[@]} -eq 0 ]]; then
  printf '\033[32m✅ All checks passed. Ready to deploy / trigger.\033[0m\n\n'
  exit 0
fi

if [[ ${#WARNINGS[@]} -gt 0 ]]; then
  printf '\033[33m⚠️  WARNINGS (%d):\033[0m\n' "${#WARNINGS[@]}"
  for w in "${WARNINGS[@]}"; do printf '  - %s\n' "$w"; done
  printf '\n'
fi

if [[ ${#ERRORS[@]} -gt 0 ]]; then
  printf '\033[31m❌ ERRORS (%d):\033[0m\n' "${#ERRORS[@]}"
  for e in "${ERRORS[@]}"; do printf '  - %s\n' "$e"; done
  printf '\n'
  exit 1
fi

# Warnings only — exit 0 but make them visible.
exit 0
