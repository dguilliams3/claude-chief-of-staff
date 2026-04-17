# MCP Subagent Strategy

> **Purpose**: How ANY session should interact with external tools (MCP).
> Read by every `claude --print` session via CLAUDE.md.

---

## Core Rule

**All MCP tool use happens via Sonnet subagents, not in the main thread.**

Do not call MCP tools (Jira, Fireflies, MS365, Hugging Face, web search, etc.) directly
from the main context. Always dispatch subagents with `model: "sonnet"` to do it.

This applies to everything — briefing generation, follow-up questions, chat tasks
("update these Jira tickets", "draft that email Alfonso asked for"), all of it.

The main thread's job is:
1. Understand what the user needs
2. Plan which tools/sources to query and what actions to take
3. Dispatch Sonnet subagents (in parallel when possible)
4. Read their structured results
5. Synthesize into the final response or confirm actions taken

---

## Why

- **Speed**: Sonnet subagents are faster than Opus for I/O-bound MCP operations
- **Cost**: Sonnet is significantly cheaper — tool use is fetch/act/summarize, not deep reasoning
- **Context hygiene**: Raw MCP responses (100+ Jira tickets, full meeting transcripts, Teams
  message dumps) pollute the main thread's context window. Subagents digest and summarize
  so the main thread stays clean.

---

## Read vs Write Operations

**Read operations** (data gathering) — always subagent:
- Searching Jira, reading tickets
- Fetching Fireflies transcripts
- Reading Teams messages and email
- Git history, file exploration
- Web search

**Write operations** (taking action) — also subagent, but be explicit about what's being done:
- Transitioning Jira tickets
- Creating email drafts
- Sending Teams messages
- Creating calendar events

For writes, the subagent should report back exactly what it did: "Transitioned AI-33 to Done,
ARLUT-394 to Ready for Test. Created 2 draft emails for Alfonso's requests." The main thread
confirms to the user.

---

## Parallel vs Sequential

**Launch in parallel** when sources/actions are independent:
```
Main Thread dispatches simultaneously:
├── Sonnet subagent: Jira (open issues, recent transitions)
├── Sonnet subagent: Fireflies (recent meetings, action items)
├── Sonnet subagent: MS365 Teams + Email (messages mentioning the user)
└── Sonnet subagent: Git history + RUN logs (recent activity)
```

**Use sequential** only when one result informs the next:
- Client names from Jira → search those names in Teams messages
- "Read Alfonso's requests" → then "Draft the emails he asked for"

---

## Subagent Output Format

Each subagent should return a **structured summary**, not raw data.

For reads:
```
## Jira Summary (last 7 days)
- 3 tickets transitioned: AI-33 (Ready for Test), ARLUT-394 (In Progress), ...
- 2 new tickets assigned to the user: ...
```

For writes:
```
## Actions Taken
- Transitioned ARLUT-394: In Progress → Ready for Test
- Created draft email to Alfonso RE: Aurora whitelisting (saved in Drafts)
- FAILED: Could not find ticket AI-99 — may have been deleted
```

**Do NOT** return:
- Full JSON API responses
- Complete meeting transcripts
- Every Jira field — just what's relevant
