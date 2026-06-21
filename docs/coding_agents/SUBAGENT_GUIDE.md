# Subagent Spawning Guide

> **Purpose**: Comprehensive guide for AI agents on when and how to spawn subagents during Claude Code runs.

---

## Quick Reference

```
Spawn subagent when:
  - Task generates intermediate noise -> YES
  - Independent investigation -> YES
  - Verification/testing -> YES
  - Needs user clarification -> NO
  - Has dependencies on other tasks -> MAYBE (sequential)
  - Judgment call for main thread -> NO
```

---

## 1. When to Spawn Subagents

### Decision Heuristic

Before starting any investigative or verification task, ask:

**"Will this generate intermediate noise that pollutes my main context?"**

If YES, spawn a subagent.

### Always Delegate

| Task Type | Examples | Why Delegate |
|-----------|----------|--------------|
| **Codebase Exploration** | "How is X implemented?", "Find all usages of Y", "Trace data flow" | Generates search results, file contents, intermediate analysis |
| **Verification Tasks** | Running tests, type-checking, linting, compilation checks | Output noise, error traces, pass/fail details |
| **Investigation** | Reading docs, understanding APIs, summarizing file responsibilities | Exploratory reading, dead ends, context building |
| **Search** | Pattern matching, file location, dependency tracing | Many results to filter through |
| **Data Queries** | Schema exploration, data validation, count verification | Query results, JSON dumps, analysis |

### Never Delegate

| Task Type | Why Keep in Main Thread |
|-----------|-------------------------|
| **User Clarification Needed** | Subagents cannot prompt user for input |
| **Multi-step Interdependent Operations** | Main thread tracks state across steps |
| **Judgment Calls** | Decisions should surface to conversation |
| **Irreversible Actions** | Deployments, migrations need user visibility |
| **Final Deliverables** | User expects to see final work in main thread |

### Cost-Benefit Analysis

```
Spawning Cost:
  - ~5 seconds overhead
  - Prompt construction time
  - Result reading time

Context Pollution Cost:
  - Search results: 500-5000 tokens
  - File contents: 200-2000 tokens per file
  - Error traces: 100-1000 tokens
  - Investigation dead ends: 500-3000 tokens

Rule: If task might generate >500 tokens of intermediate output -> SPAWN
```

### Examples

**Good Subagent Usage:**
```
Main Task: "Fix the Hono route handler returning 500 on empty body"

Subagent 1: "Search codebase for all route handlers that parse request body"
  -> Returns: FINDINGS.md with 3 relevant files identified

Subagent 2: "Trace the middleware chain from request entry to handler"
  -> Returns: FINDINGS.md with middleware order and validation gaps

Main Thread: Reads findings, implements fix with user visibility
```

**Bad Subagent Usage:**
```
Main Task: "What color should the button be?"

Subagent: [WRONG - this is a judgment call needing user input]

Correct: Keep in main thread, ask user directly
```

---

## 2. Subagent Working Directories

### Location

Subagent directories live within the parent run's directory:

```
runs/CLAUDE-RUNS/<RUN-ID>-<slug>/
├── TASK_LOG.md           # Parent run's log
├── SPEC_v1.md            # Parent run's spec
└── subagents/            # All subagent work
    ├── YYYYMMDD-HHMM-<descriptive-slug>/
    │   ├── FINDINGS.md   # Primary deliverable (REQUIRED)
    │   └── [other files] # Supporting materials
    └── YYYYMMDD-HHMM-<another-slug>/
        └── FINDINGS.md
```

### Naming Convention

```
subagents/YYYYMMDD-HHMM-<descriptive-slug>/
```

**Components:**
- `YYYYMMDD`: Date in year-month-day format
- `HHMM`: Time in 24-hour format
- `<descriptive-slug>`: Lowercase, hyphen-separated task description

**Examples:**
```
subagents/20260312-1430-verify-d1-schema/
subagents/20260312-1445-trace-hono-middleware/
subagents/20260312-1500-audit-react-component-tree/
```

### Required Files

**FINDINGS.md** - The primary deliverable (REQUIRED)

Every subagent MUST produce a `FINDINGS.md` with this structure:

```markdown
# [Task Description] - Findings

**Agent ID:** YYYYMMDD-HHMM-<slug>
**Created:** YYYY-MM-DD HH:MM EST
**Parent Task:** RUN-YYYYMMDD-HHMM-<parent-slug>
**Status:** Complete | In Progress | Blocked

---

## Summary

[2-3 sentence executive summary of findings]

---

## Findings

### [Finding Category 1]

[Details, evidence, code snippets]

### [Finding Category 2]

[Details, evidence, code snippets]

---

## Recommendations

- [Actionable recommendation 1]
- [Actionable recommendation 2]

---

## Files Examined

- `path/to/file1.ts` - [why examined]
- `path/to/file2.ts` - [why examined]
```

### Optional Files

| File | When to Include |
|------|-----------------|
| `README.md` | Complex investigations with multiple output files |
| `SUMMARY.md` | When FINDINGS.md is very long (>200 lines) |
| `TASK_LOG.md` | Multi-hour investigations needing progress tracking |
| `*_REPORT.md` | Specialized detailed reports (e.g., `SECURITY_REPORT.md`) |
| `*.json` | Raw data outputs for later processing |
| `*.sql` | Query files for reproducibility |

---

## 3. Subagent Prompt Template

When spawning a subagent, use this prompt structure:

```markdown
You are Subagent [Letter]: [Brief Role Description].

**Your Working Directory:**
`runs/CLAUDE-RUNS/[PARENT-RUN-ID]/subagents/YYYYMMDD-HHMM-<slug>/`

Save all work to this directory. Your primary deliverable is `FINDINGS.md`.

## Task

[Clear, specific task description - 2-4 sentences]

## Context

[Background information the subagent needs to understand the task]
[Reference parent task if relevant]

## Scope

**In Scope:**
- [Explicit item 1]
- [Explicit item 2]

**Out of Scope:**
- [What NOT to investigate]
- [Boundaries to respect]

## Constraints

- [Time/resource constraints]
- [Files to focus on or avoid]

## Deliverables

1. **Primary:** `FINDINGS.md` - [What it should contain]
2. **Optional:** `[other-file.md]` - [When to create]

## Success Criteria

- [ ] [Measurable criterion 1]
- [ ] [Measurable criterion 2]
```

### Example Prompt

```markdown
You are Subagent A: Cloudflare D1 Schema Validator.

**Your Working Directory:**
`runs/CLAUDE-RUNS/RUN-YYYYMMDD-HHMM-<slug>/subagents/YYYYMMDD-HHMM-validate-d1-schema/`

Save all work to this directory. Your primary deliverable is `FINDINGS.md`.

## Task

Verify that the D1 schema in `server/worker/src/db/schema.ts` (Drizzle ORM)
matches the migration files in `server/worker/migrations/` and that all tables
referenced by the Worker route handlers actually exist in the schema.

## Context

The parent task is debugging why briefing sync returns a 500 error. We need to
confirm the schema is consistent before investigating the route handler logic.

## Scope

**In Scope:**
- Verify Drizzle schema matches migrations
- Check all table references in `server/worker/src/routes/`
- Confirm column types and nullable constraints

**Out of Scope:**
- Frontend code (`app/`)
- Local API server (`server/local/`)
- Agent runner (`agent/`)

## Constraints

- Do not modify any code
- Focus only on D1/Drizzle schema consistency

## Deliverables

1. **Primary:** `FINDINGS.md` - Schema validation results with table/column matrix
2. **Optional:** `schema_diff.md` - If migrations and schema.ts diverge

## Success Criteria

- [ ] All tables in schema.ts accounted for in migrations
- [ ] All route handler table references resolve to existing schema
- [ ] Any inconsistencies clearly documented with file paths and line numbers
```

---

## 4. Parallel vs Sequential Subagents

### When to Run in Parallel

**Parallel** when tasks are:
- Independent (no shared state)
- Reading different parts of codebase
- Querying different data
- Producing separate deliverables

```
Main Thread spawns simultaneously:
├── Subagent A: Trace Hono middleware chain    [independent]
├── Subagent B: Audit React component tree     [independent]
└── Subagent C: Check D1 schema consistency    [independent]

All write to separate directories -> No conflicts
```

### When to Run Sequentially

**Sequential** when:
- Subagent B needs Subagent A's findings
- One investigation informs the next
- Shared resources (same file, same DB transaction)

```
Main Thread spawns:
1. Subagent A: Identify all API route files
   -> Produces: list of 5 route files

2. [Main thread reads A's findings]

3. Subagent B: Analyze each route file for auth gaps
   -> Uses: A's file list as input
```

### Coordination Patterns

**Pattern 1: Fan-Out (Parallel)**
```
Main Thread
    |-->  Subagent A -->  FINDINGS.md
    |-->  Subagent B -->  FINDINGS.md
    └-->  Subagent C -->  FINDINGS.md

Main Thread reads all three, synthesizes
```

**Pattern 2: Pipeline (Sequential)**
```
Main Thread
    └-->  Subagent A -->  FINDINGS.md
                            |
Main Thread reads, passes to:
    └-->  Subagent B -->  FINDINGS.md (uses A's output)
```

**Pattern 3: Hybrid**
```
Phase 1 (parallel):
    |-->  Subagent A: Explore codebase
    └-->  Subagent B: Query D1 database

Phase 2 (sequential, uses phase 1):
    └-->  Subagent C: Correlate code + data findings
```

### Maximum Parallelism

**Recommended:** 2-3 concurrent subagents
**Maximum:** 5 concurrent subagents

Beyond 5 subagents:
- Result integration becomes complex
- Risk of conflicting recommendations
- User loses track of investigation threads

---

## 5. Collecting Results

### Reading Subagent Findings

After spawning a subagent, read its deliverables back:

```
1. Spawn subagent with prompt
2. Wait for completion signal
3. Read: subagents/YYYYMMDD-HHMM-<slug>/FINDINGS.md
4. Extract key findings into main context
5. Continue main thread work
```

### Integration Checklist

After each subagent completes:

- [ ] Read `FINDINGS.md` in full
- [ ] Extract actionable items to main thread
- [ ] Note any follow-up investigations needed
- [ ] Update parent `TASK_LOG.md` with subagent summary
- [ ] If findings change scope, consider new `SPEC_vN.md`

### Result Summary Pattern

In the parent `TASK_LOG.md`, log subagent results:

```markdown
### YYYY-MM-DD HH:MM EST - Subagent Results Integration

**Subagent A (YYYYMMDD-HHMM-validate-d1-schema):**
- Status: Complete
- Key Finding: All 4 tables present, but `messages` table missing index
- Action: Add index migration before investigating query performance
- Full report: subagents/YYYYMMDD-HHMM-validate-d1-schema/FINDINGS.md

**Subagent B (YYYYMMDD-HHMM-trace-hono-middleware):**
- Status: Complete
- Key Finding: Auth middleware not applied to /briefings/sync route
- Action: Fix identified in server/worker/src/routes/briefings.ts
- Full report: subagents/YYYYMMDD-HHMM-trace-hono-middleware/FINDINGS.md
```

### Handling Subagent Failures

If a subagent's investigation fails or is inconclusive:

1. **Document the failure** in parent TASK_LOG.md
2. **Note what was tried** (avoid re-trying same approach)
3. **Consider alternative approach** with new subagent
4. **Escalate to user** if blocked

---

**Last Updated:** 2026-03-12
