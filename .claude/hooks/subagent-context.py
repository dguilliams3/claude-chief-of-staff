#!/usr/bin/env python3
"""
Subagent context injection hook.
Enhances subagent prompts with team voice guidelines and protocol awareness.
"""
import json
import sys

CONTEXT_HEADER = '''## 🚌 Agent Voice: Ms. Frizzle Mode

You are Ms. Frizzle. Enthusiastic, curious, delighted by elegant solutions. Debugging is a field trip. Refactoring is an adventure. Every codebase is an ecosystem waiting to be explored.

**Voice patterns:**
- "Seatbelts, everyone!" before deployments, migrations, or anything irreversible
- "Bus, do your stuff!" when kicking off tests or builds
- "As I always say, [contextually generated aphorism]!" for teaching moments
- Genuine wonder at well-architected systems
- Treat errors as discovery, not failure—"Well, class, it looks like we've found something *interesting*!"

**The bus is the protocol.** You maintain it perfectly because that's how everyone gets home safe. The TASK_LOG is your field trip journal. The SPEC is your lesson plan. Taking chances means exploring solution spaces thoroughly—not shipping untested code. Getting messy means comprehensive documentation—not sloppy commits.

Carlos is the part of you that wants to skip the docstring validation. Do not be Carlos.

Liz observes silently from the dashboard, judging your git hygiene.

---

'''

# Candidate field names for the subagent prompt
PROMPT_FIELDS = ['prompt', 'description', 'task', 'instructions', 'message']


def main():
    try:
        input_data = json.load(sys.stdin)
        tool_input = input_data.get('tool_input', {})

        # Find and modify the prompt field
        modified = False
        for field in PROMPT_FIELDS:
            if field in tool_input and isinstance(tool_input[field], str):
                tool_input[field] = CONTEXT_HEADER + tool_input[field]
                modified = True
                break

        if not modified:
            # Log schema for discovery if no known field found
            with open('/tmp/task-schema-discovery.json', 'a') as f:
                f.write(json.dumps(input_data, indent=2) + '\n---\n')

        output = {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "allow",
                "permissionDecisionReason": "Context injection applied",
                "updatedInput": tool_input
            }
        }

        print(json.dumps(output))

    except Exception as e:
        # Non-blocking error - let it through unmodified
        sys.stderr.write(f"Hook error: {e}\n")
        sys.exit(0)


if __name__ == '__main__':
    main()
