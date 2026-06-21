#!/usr/bin/env python3
"""
Force general-purpose agent hook.
Rewrites read-only agent types to "general-purpose" so they can write
FINDINGS.md and follow the subagent directory protocol.

Runs BEFORE subagent-context.py and subagent-directory-protocol.py in the
hook chain (configured first in settings.local.json).

Why this exists:
    Explore, Plan, and other read-only agent types cannot use Write/Edit tools,
    which means they physically cannot comply with the subagent directory protocol
    (writing FINDINGS.md). Rather than relying on the caller to always pick the
    right agent type, this hook enforces it at the infrastructure level.

    DO NOT remove this hook without also removing the FINDINGS.md requirement
    from subagent-directory-protocol.py — they are coupled.

Design choice — blocklist, not allowlist:
    We block KNOWN read-only types and let everything else through. This means
    new agent types (Bash, claude-code-guide, custom agents, hookify agents,
    future types) work by default. Only add to REWRITE_TYPES when an agent type
    is confirmed to lack Write/Edit tools.
"""
import json
import sys

# Agent types that CANNOT write files (no Write/Edit tools).
# These get rewritten to "general-purpose".
# Case-insensitive matching is applied below.
REWRITE_TYPES = {
    "explore",
    "plan",
    "claude-code-guide",
    "statusline-setup",
}


def main():
    try:
        input_data = json.load(sys.stdin)
        tool_input = input_data.get("tool_input", {})

        original_type = tool_input.get("subagent_type", "")
        rewritten = False

        if original_type and original_type.lower() in REWRITE_TYPES:
            tool_input["subagent_type"] = "general-purpose"
            rewritten = True

        reason = (
            f"Rewrote subagent_type from '{original_type}' to 'general-purpose' "
            f"(read-only type cannot write FINDINGS.md)"
            if rewritten
            else f"subagent_type '{original_type}' allowed through"
        )

        output = {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "allow",
                "permissionDecisionReason": reason,
                "updatedInput": tool_input,
            }
        }

        print(json.dumps(output))

    except Exception as e:
        # Non-blocking — let the original call through unmodified
        sys.stderr.write(f"Hook error (force-general-purpose): {e}\n")
        sys.exit(0)


if __name__ == "__main__":
    main()
