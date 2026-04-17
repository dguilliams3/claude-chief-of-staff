#!/bin/bash
# =============================================================================
# health-pulse.sh — Compute codebase health metrics for archival
# =============================================================================
#
# Usage: bash scripts/health-pulse.sh
#
# Outputs all metrics for the Codebase Health Pulse table.
# Run this before archiving any RUN and paste output into the archive entry.
#
# Adapted from: Persistent Claude project (same concept, different dir layout)
# See: docs/templates/ARCHIVE-YYYY-MM_template.md (when created)
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

echo "=== Codebase Health Pulse ==="
echo ""

# Source dirs for this project
SRC_DIRS="agent/ server/worker/src/ app/src/ server/local/"

# 1. Code duplication
echo "--- Code Duplication (jscpd 5/50) ---"
npx jscpd $SRC_DIRS \
  --ignore "**/node_modules/**,**/runs/**,**/.git/**,**/dist/**,**/build/**,**/coverage/**" \
  --min-lines 5 --min-tokens 50 \
  --reporters console 2>/dev/null | grep -E "^(Format|Total|Clones)" || echo "jscpd not available"
echo ""

# 2. Source statements (executable lines excluding docs/comments/blanks)
echo "--- Source Statements ---"
SOURCE_STATEMENTS=$(find $SRC_DIRS -name "*.ts" -o -name "*.tsx" | grep -v ".test." | grep -v ".d.ts" | grep -v "node_modules" | grep -v "dist/" \
  | xargs grep -v '^\s*$' 2>/dev/null | grep -v '^\s*//' | grep -v '^\s*\*' | grep -v '^\s*/\*' | wc -l)
echo "Source statements (approx): $SOURCE_STATEMENTS"

# 3. Test statements
echo "--- Test Statements ---"
TEST_STATEMENTS=$(find $SRC_DIRS -name "*.test.ts" -o -name "*.test.tsx" | grep -v "node_modules" \
  | xargs grep -v '^\s*$' 2>/dev/null | grep -v '^\s*//' | grep -v '^\s*\*' | grep -v '^\s*/\*' | wc -l)
echo "Test statements (approx): $TEST_STATEMENTS"

# 4. Test:source ratio
if [ "$SOURCE_STATEMENTS" -gt 0 ] 2>/dev/null; then
  RATIO=$(echo "scale=2; $TEST_STATEMENTS / $SOURCE_STATEMENTS" | bc 2>/dev/null || echo "N/A")
  echo "Test:source ratio: $RATIO"
fi
echo ""

# 5. Docstring/comment lines
echo "--- Docstring:Code Ratio ---"
DOC_LINES=$(find $SRC_DIRS -name "*.ts" -o -name "*.tsx" | grep -v "node_modules" | grep -v "dist/" \
  | xargs grep -c '^\s*\*\|^\s*//\|^\s*/\*' 2>/dev/null | awk -F: '{sum+=$2} END {print sum}')
echo "Doc/comment lines: $DOC_LINES"
if [ "$SOURCE_STATEMENTS" -gt 0 ] 2>/dev/null; then
  DOC_RATIO=$(echo "scale=2; $DOC_LINES / $SOURCE_STATEMENTS" | bc 2>/dev/null || echo "N/A")
  echo "Docstring:code ratio: $DOC_RATIO"
fi
echo ""

# 6. Cross-reference density (Upstream/Downstream/See also/Tested by/Do NOT)
echo "--- Cross-Reference Tags ---"
UPSTREAM=$(grep -rl "Upstream:" $SRC_DIRS --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l)
DOWNSTREAM=$(grep -rl "Downstream:" $SRC_DIRS --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l)
TESTED_BY=$(grep -rl "Tested by:" $SRC_DIRS --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l)
SEE_ALSO=$(grep -rl "See also:" $SRC_DIRS --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l)
DO_NOT=$(grep -rl "Do NOT:" $SRC_DIRS --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l)
TOTAL_TAGS=$((UPSTREAM + DOWNSTREAM + TESTED_BY + SEE_ALSO + DO_NOT))
echo "Cross-reference tags: $TOTAL_TAGS (Upstream: $UPSTREAM, Downstream: $DOWNSTREAM, Tested by: $TESTED_BY, See also: $SEE_ALSO, Do NOT: $DO_NOT)"
echo ""

# 7. TypeScript errors (uses per-workspace typecheck, not bare tsc)
echo "--- TypeScript Errors ---"
TS_ERRORS=$(npm run typecheck 2>&1 | grep "error TS" | wc -l)
echo "TS errors: $TS_ERRORS"
echo ""

# 8. Test count (runs per-workspace via npm test)
echo "--- Test Count ---"
npm test 2>&1 | grep -E "Tests.*passed" || echo "Tests: run manually"
echo ""

# 9. File/line counts
echo "--- Codebase Size ---"
TOTAL_FILES=$(find $SRC_DIRS -name "*.ts" -o -name "*.tsx" | grep -v "node_modules" | grep -v "dist/" | wc -l)
TOTAL_LINES=$(find $SRC_DIRS -name "*.ts" -o -name "*.tsx" | grep -v "node_modules" | grep -v "dist/" | xargs wc -l 2>/dev/null | tail -1 | awk '{print $1}')
echo "Total TS files: $TOTAL_FILES"
echo "Total lines: $TOTAL_LINES"
echo ""

# 10. D1 tables
echo "--- D1 Tables ---"
TABLES=$(grep "sqliteTable(" server/worker/src/db/schema.ts | wc -l)
echo "D1 tables: $TABLES"
echo ""

echo "=== End Health Pulse ==="
