#!/usr/bin/env python3
"""
Plan mode reminder hook.
Injects TASK_LOG and subagent planning reminders when entering plan mode.

Triggers on: PreToolUse with matcher "EnterPlanMode"
"""
import json
import sys

PLAN_MODE_REMINDER = """
## Plan Mode Reminders

**TASK_LOG Updates:**
- Add "Update TASK_LOG.md" as a todo item BETWEEN each other major step
- This ensures progress is captured incrementally, not just at the end

**Subagent Specification (for applicable tasks):**
For each task that will be delegated to a subagent, specify:
1. **Count**: How many subagents (e.g., "2 parallel subagents")
2. **Model**: Which model per task (haiku for focused tasks, sonnet for complex architecture)
3. **Directory**: The subagent's working directory for FINDINGS.md and other documents
   - Format: `subagents/YYYYMMDD-HHMM-<task-slug>/`
   - Example: `subagents/20260105-1430-trace-auth-flow/`

**Example Plan Item:**
```
- [ ] Investigate auth flow (subagent)
      - Model: haiku
      - Directory: subagents/20260105-1430-trace-auth/
      - Deliverable: FINDINGS.md with code locations and recommendations
- [ ] Update TASK_LOG.md with investigation results
- [ ] Implement auth fix based on findings
- [ ] Update TASK_LOG.md with implementation details
```

---

"""


def main():
    try:
        input_data = json.load(sys.stdin)
        tool_input = input_data.get("tool_input", {})

        # EnterPlanMode doesn't have a prompt field to modify,
        # but we can add context via additionalContext
        output = {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "allow",
                "permissionDecisionReason": "Plan mode reminder injected",
                "additionalContext": PLAN_MODE_REMINDER,
            }
        }

        print(json.dumps(output))

    except Exception as e:
        # Non-blocking error - let it through unmodified
        sys.stderr.write(f"Hook error (plan-mode-reminder): {e}\n")
        sys.exit(0)


if __name__ == "__main__":
    main()
