#!/usr/bin/env bash
# init-run.sh — Initialize a new Claude Code run directory
#
# Usage: ./init-run.sh <slug>
# Example: ./init-run.sh fix-auth-bug
#   Creates: RUN-YYYYMMDD-HHMM-fix-auth-bug/ with TASK_LOG.md and SPEC_v1.md
#
# Templates sourced from: docs/coding_agents/claude_run_templates/

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEMPLATE_DIR="$REPO_ROOT/docs/coding_agents/claude_run_templates"

if [ $# -lt 1 ]; then
  echo "Usage: ./init-run.sh <slug>"
  echo "Example: ./init-run.sh fix-auth-bug"
  exit 1
fi

SLUG="$1"
RUN_ID="$(date +%Y%m%d-%H%M)"
TIMESTAMP="$(date +'%Y-%m-%d %H:%M') EST"
DESCRIPTION="[Describe objective here]"

RUN_DIR="$SCRIPT_DIR/RUN-${RUN_ID}-${SLUG}"

if [ -d "$RUN_DIR" ]; then
  echo "ERROR: Directory already exists: $RUN_DIR"
  exit 1
fi

mkdir -p "$RUN_DIR"

# Generate TASK_LOG.md from template
if [ -f "$TEMPLATE_DIR/TASK_LOG/TASK_LOG.md" ]; then
  sed -e "s/{{RUN_ID}}/$RUN_ID/g" \
      -e "s/{{SLUG}}/$SLUG/g" \
      -e "s/{{TIMESTAMP}}/$TIMESTAMP/g" \
      -e "s/{{DESCRIPTION}}/$DESCRIPTION/g" \
      "$TEMPLATE_DIR/TASK_LOG/TASK_LOG.md" > "$RUN_DIR/TASK_LOG.md"
else
  echo "WARNING: TASK_LOG template not found at $TEMPLATE_DIR/TASK_LOG/TASK_LOG.md"
fi

# Generate SPEC_v1.md from template
if [ -f "$TEMPLATE_DIR/SPEC/SPEC_v1.md" ]; then
  sed -e "s/{{RUN_ID}}/$RUN_ID/g" \
      -e "s/{{SLUG}}/$SLUG/g" \
      -e "s/{{TIMESTAMP}}/$TIMESTAMP/g" \
      -e "s/{{DESCRIPTION}}/$DESCRIPTION/g" \
      "$TEMPLATE_DIR/SPEC/SPEC_v1.md" > "$RUN_DIR/SPEC_v1.md"
else
  echo "WARNING: SPEC template not found at $TEMPLATE_DIR/SPEC/SPEC_v1.md"
fi

echo "✅ Created: $RUN_DIR"
echo "   TASK_LOG.md"
echo "   SPEC_v1.md"
echo ""
echo "Run ID: RUN-$RUN_ID"
