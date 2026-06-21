#!/usr/bin/env python3
"""
SPEC quality gate hook.
Triggers on Edit/Write to SPEC_v*.md files, injecting a second-pass
quality checklist as additional context.

Triggers on: PreToolUse (Edit, Write)
"""
import json
import re
import sys


SPEC_PATTERN = re.compile(r'SPEC_v\d+\.md$')

QUALITY_CHECKLIST = """

## SPEC Quality Gate — Second Pass Required

You just wrote or edited a SPEC file. Before moving on, verify this SPEC contains ALL of the following. If any are missing, add them NOW in a follow-up edit.

### Required Sections

1. **Orchestrator Protocol with Numbered Steps** — every phase has numbered steps, not just prose
2. **TASK_LOG Updates Between Every Step** — explicit "Update TASK_LOG.md" lines between EVERY numbered step
3. **Agent Roster** — table with: agent name, slug, model, purpose, batch/phase assignment. If no agents, state "Orchestrator only"
4. **Subagent Directories** — path convention (subagents/YYYYMMDD-HHMM-slug/), SPEC.md and FINDINGS.md locations
5. **Verification Gates Between Batches** — GATE markers with specific commands, pass/fail criteria

If this was a minor edit (typo, timestamp), you may skip the second pass.
"""


def main():
    try:
        input_data = json.load(sys.stdin)
        tool_name = input_data.get('tool_name', '')
        tool_input = input_data.get('tool_input', {})

        # Only trigger on Edit or Write
        if tool_name not in ('Edit', 'Write'):
            print(json.dumps({}))
            return

        # Get file path from tool input
        file_path = tool_input.get('file_path', '')

        # Normalize path separators for cross-platform matching
        normalized = file_path.replace('\\', '/')

        # Check if this is a SPEC file
        if not SPEC_PATTERN.search(normalized):
            print(json.dumps({}))
            return

        # It's a SPEC file — inject quality checklist as context
        output = {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "additionalContext": QUALITY_CHECKLIST,
            }
        }
        print(json.dumps(output))

    except Exception as e:
        sys.stderr.write(f"Hook error (spec-quality-gate): {e}\n")
        sys.exit(0)


if __name__ == '__main__':
    main()
