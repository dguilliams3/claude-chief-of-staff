#!/usr/bin/env python3
"""
Block destructive git commands.
Prevents agents from running git commands that destroy uncommitted work.

Triggers on: PreToolUse (Bash)

Blocked patterns:
    - git reset --hard  — nukes staged + unstaged changes, moves HEAD
    - git clean -f      — permanently deletes untracked files
    - git checkout -- .  — discards ALL unstaged changes (blanket)
    - git restore .      — same as checkout -- . (modern equivalent)

Allowed (not blocked):
    - git checkout <branch>           — just switching branches
    - git checkout -- <specific-file> — targeted, scoped discard
    - git restore <specific-file>     — targeted, scoped discard
    - git reset (without --hard)      — soft/mixed resets are fine
    - git clean -n                    — dry run, no deletion
"""
import json
import re
import sys

# Each pattern has a regex and a human-readable reason for the block.
BLOCKED_PATTERNS = [
    (
        re.compile(r"git\s+reset\s+.*--hard"),
        "git reset --hard destroys uncommitted work. Use 'git stash' or 'git checkout -b <branch> origin/main' instead.",
    ),
    (
        re.compile(r"git\s+clean\s+.*-[a-zA-Z]*f"),
        "git clean -f permanently deletes untracked files. Ask the user before removing untracked files.",
    ),
    (
        re.compile(r"git\s+checkout\s+--\s+\."),
        "git checkout -- . discards ALL unstaged changes. Target specific files instead, or ask the user.",
    ),
    (
        re.compile(r"git\s+restore\s+\."),
        "git restore . discards ALL unstaged changes. Target specific files instead, or ask the user.",
    ),
]


def main():
    try:
        input_data = json.load(sys.stdin)
        tool_input = input_data.get("tool_input", {})
        command = tool_input.get("command", "")

        for pattern, reason in BLOCKED_PATTERNS:
            if pattern.search(command):
                output = {
                    "hookSpecificOutput": {
                        "hookEventName": "PreToolUse",
                        "permissionDecision": "block",
                        "permissionDecisionReason": reason,
                    }
                }
                print(json.dumps(output))
                return

        # Not a destructive git command — allow through
        output = {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "allow",
                "permissionDecisionReason": "Command is not a blocked destructive git operation.",
            }
        }
        print(json.dumps(output))

    except Exception as e:
        # Non-blocking — let the call through if hook itself fails
        sys.stderr.write(f"Hook error (block-destructive-git): {e}\n")
        sys.exit(0)


if __name__ == "__main__":
    main()
