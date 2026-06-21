#!/usr/bin/env python3
"""
Task log reminder hook.
Gentle nudge on every user prompt to consider updating TASK_LOG.md.

Triggers on: UserPromptSubmit
"""
import json
import sys

REMINDER = """If you are in an active run, consider whether you have updated TASK_LOG.md with your recent action(s)."""


def main():
    try:
        output = {
            "hookSpecificOutput": {
                "hookEventName": "UserPromptSubmit",
                "additionalContext": REMINDER,
            }
        }
        print(json.dumps(output))

    except Exception as e:
        sys.stderr.write(f"Hook error (task-log-reminder): {e}\n")
        sys.exit(0)


if __name__ == "__main__":
    main()
