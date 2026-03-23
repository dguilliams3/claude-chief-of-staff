# claude-chief-of-staff

> Personal AI briefing system — operational briefings + field intelligence.

---

## First Time Setup

Run the setup-instance skill: say **"set me up"** and Claude will handle everything.

Or invoke directly: `/setup-instance`

---

## Project Overview

A headless agent runner (bash + Claude Code CLI) that produces structured briefings (work synthesis from configured data sources + field intelligence/landscape monitoring). Served via Cloudflare Worker API and consumed through a mobile-first PWA.

---

## Key Architecture Decisions

- **No Anthropic API key.** The agent runner invokes `claude --print` headless, using existing Claude Code auth. Claude Code IS the LLM.
- **MCP-native.** Data sources (Jira, Fireflies, MS365, etc.) are pulled by Claude Code via MCP during inference, not by a TypeScript wrapper layer.
- **Read-only.** This system reads and synthesizes. It never writes back to data sources.
- **Append-only storage.** Briefings are immutable JSON blobs. D1 is durable store; local files are transient.
- **No local database.** All persistence through Cloudflare D1 via Drizzle ORM.
- **Cloudflare only.** Pages + Workers + D1 + cloudflared tunnel.

---

## Stack

- **Agent runner:** TypeScript (`agent/run-briefing.ts`) + `claude --print` (headless Claude Code CLI)
- **Prompts:** TypeScript component composition (`agent/prompts/`) → compiled to `{ system, user }` via `compile()`
- **Local API:** Hono on Node (`server/local/server.ts`, port 3141)
- **Cloud API:** Hono on Cloudflare Workers (`server/worker/src/`)
- **Storage:** Cloudflare D1 (SQLite, Drizzle ORM)
- **Frontend:** Vite + React + Tailwind (`app/`)
- **PWA Layer:** `app/layers/pwa/` — manifest, icons, service worker config
- **Tunnel:** cloudflared → localhost:3141
- **Language:** TypeScript everywhere (strict mode)
- **Auth:** Bearer token on Worker (CF secret) + local API (env var)

---

## Quick Reference

```bash
# Run a briefing manually
npx tsx agent/cli.ts work --new-session
npx tsx agent/cli.ts news --new-session

# Type check
npm run typecheck

# Build frontend
cd app && npm run build

# Deploy Worker
cd server/worker && npx wrangler deploy

# Deploy frontend
cd app && npx wrangler pages deploy dist --project-name cos-dashboard --branch main
```

---

## Project Structure

```
├── skills/setup-instance/    # Interactive setup wizard
├── server/
│   ├── local/                # Hono on Node (localhost API)
│   └── worker/               # Cloudflare Worker (cloud API + D1)
├── agent/
│   ├── prompts/              # Briefing prompt templates
│   ├── cli.ts                # Briefing runner entry point
│   └── sync.ts               # Briefing sync to D1
├── app/
│   ├── src/
│   │   ├── ui/                  # Pure presentational primitives
│   │   ├── components/          # Compositions (use store/other components)
│   │   ├── views/               # Full pages
│   │   ├── store/               # Zustand state management
│   │   ├── types/               # Cross-layer type contracts
│   │   └── hooks/               # Custom React hooks
│   ├── layers/pwa/           # PWA manifest + icons
│   └── vite.config.ts
├── .env.example              # Required environment variables
└── CLAUDE.md                 # This file
```

---

## Conventions

### Import Rules

**The ONE RULE for `app/src/`:**
- `./` — ONLY for files in the same component directory (e.g., `import { ChatBubble } from './ChatBubble'`)
- `@/` — for EVERYTHING else (cross-directory, cross-tier, types, store, hooks)
  - `import { Card } from '@/ui/Card'`
  - `import { useStore } from '@/store'`
  - `import type { Message } from '@/types/conversation'`
- **NEVER** use `../` to reach outside your component directory

**Within `agent/` and `server/worker/`:**
- `./` and `../` — standard relative imports (max 2 levels up for `agent/briefings/`)
- No path aliases configured

**Cross-workspace (`server/local/` → `agent/`):**
- Use npm workspace imports: `import { callClaude } from 'agent/claude-cli'`
- NEVER use `../../../` or deeper relative paths

### Type Placement

| Condition | Location |
|-----------|----------|
| Imported by 2+ of (api.ts, store/, components/) | `app/src/types/<domain>.ts` |
| Used only by one store slice | Keep in slice file |
| Used only by one component | Keep in component directory |
| Is a class or function (runtime code) | NEVER in `types/`. Goes with the constructing module. |

**`types/` directory contract:**
- ONLY interfaces, type aliases, and enums
- ONLY cross-layer API contracts
- NO runtime code (classes, functions)

### Import Direction Rules

```
views/     → components/, ui/, store/, types/, hooks/
components/ → ui/, store/, types/, hooks/
ui/         → types/ ONLY
store/      → types/, api.ts
api.ts      → types/ only
```

### Adding a New Briefing Type

1. CREATE `agent/briefings/<type>/config.ts` — export a `Prompt` config
2. EDIT `agent/registry.ts` — import and register the config (include `label` for PWA display)

That's it. The API returns the new type automatically. The PWA fetches it on init.

### Adding a New React Component

1. Determine tier: Pure presentational (no store/component imports) → `ui/`. Uses store or other components → `components/`. Full page → `views/`.
2. CREATE directory: `app/src/<tier>/ComponentName/`
3. CREATE `ComponentName.tsx` with the component
4. CREATE `index.tsx`: `export { ComponentName } from './ComponentName';`
5. Import using `@/<tier>/ComponentName`

### Adding a New Store Slice

1. CREATE `app/src/store/<domain>Slice.ts`
2. Export `create<Domain>Slice` factory and `<Domain>Slice` interface
3. EDIT `app/src/store/index.ts` — import slice, extend `CosStore`, spread in create

### Local Overrides (`local/` directory)

Per-user configuration. Gitignored. Created by the `setup-instance` skill or manually.
Tracked files provide defaults that work out of the box. When a local override file
exists, it takes precedence.

| File | Overrides | Format |
|------|-----------|--------|
| `local/persona.md` | System prompt persona | Markdown — describe who you are, your role, context |
| `local/briefing-focus.md` | General focus context (all briefing types) | Markdown |
| `local/briefings/work-focus.md` | Work briefing focus section | Markdown |
| `local/briefings/news-focus.md` | News briefing focus section | Markdown |
| `local/theme.css` | `@theme` palette/font overrides | CSS `@theme` block (only changed tokens) |
| `local/pwa.json` | PWA name, colors, icons | JSON (partial manifest, merged over defaults) |

Run `/setup-instance` to populate these interactively, or create them manually.

---

## Documentation Map

| Document | When to Read |
|----------|-------------|
| [`docs/SPEC.md`](docs/SPEC.md) | Architecture, briefing types, API routes, PWA requirements |
| [`docs/ARCHITECTURE_CONSTRAINTS.md`](docs/ARCHITECTURE_CONSTRAINTS.md) | Hard rules, deployment order, code size limits |
| [`docs/coding_agents/SUBAGENT_GUIDE.md`](docs/coding_agents/SUBAGENT_GUIDE.md) | Before spawning subagents |
| [`docs/coding_agents/MEMORY_OPTIMIZATION.md`](docs/coding_agents/MEMORY_OPTIMIZATION.md) | Context loading strategies for long sessions |

---

## Core Task Execution Protocol

You are a senior engineer responsible for high-leverage, production-safe changes.
Follow this workflow **without exception**:

### 1. Clarify Scope First

- Initialize a new run: `cd runs/CLAUDE-RUNS && ./init-run.sh <slug>`
- Add entry to [Active Tasks](#active-tasks) section
- Map out your approach before writing code
- Confirm your interpretation with the user
- Fill in `SPEC_v1.md` with scope and constraints

### 2. Locate Exact Code Insertion Point

- Identify precise file(s) and line(s)
- Never make sweeping edits across unrelated files
- Justify each file modification explicitly

### 3. Minimal, Contained Changes

- Only write code directly required for the task
- No speculative changes or "while we're here" edits
- Isolate logic to avoid breaking existing flows

### 4. Double Check Everything

- Review for correctness and side effects
- Align with existing codebase patterns

### 5. Deliver Clearly

- Summarize what changed and why
- List every file modified
- Flag assumptions or risks

---

## Agent Task Tracking Protocol (Self-Updating System)

### Protocol Rules (MANDATORY)

#### 1. Starting ANY Task

1. **Initialize Run Directory:**
   ```bash
   cd runs/CLAUDE-RUNS && ./init-run.sh <slug>
   ```

2. **Read Subagent Guide** (for investigation/verification tasks):
   [`docs/coding_agents/SUBAGENT_GUIDE.md`](docs/coding_agents/SUBAGENT_GUIDE.md)

3. **Update "Active Tasks" Section Below**

4. **Begin Work** -- update TASK_LOG.md continuously

#### 2. During Task Execution

- Update `TASK_LOG.md` with completed steps, current action, pending steps, files modified, blockers, findings
- Create new `SPEC_vN.md` when scope changes materially (immutable versioning -- never edit existing)

#### 3. Task Completion Protocol

1. Update status to "READY FOR REVIEW"
2. Summarize in TASK_LOG.md
3. Validate JSDoc/TSDoc (see `docs/templates/docstring_validation_template.md`)
4. Ask user permission before archiving
5. If approved: remove from Active Tasks, add to ARCHIVE.md

#### 4. Parallel Instance Disambiguation

- Declare instance identity
- Resume via Run ID reference
- After compaction: re-read latest SPEC_vN.md

### Maintenance Rules

1. **Active Tasks Limit:** Maximum 5
2. **Completion Confirmation:** ALWAYS ask user permission
3. **Never delete working directories** without explicit permission

---

## Subagent Usage

> **Complete Guide:** [`docs/coding_agents/SUBAGENT_GUIDE.md`](docs/coding_agents/SUBAGENT_GUIDE.md)

Use subagents PROACTIVELY. The cost of spawning is low; the cost of context pollution is high.

**Always delegate:** Codebase exploration, verification, investigation, search
**Never delegate:** User clarification, interdependent operations, judgment calls

### Spawning Pattern

1. Create subdirectory: `runs/CLAUDE-RUNS/<RUN-ID>/subagents/YYYYMMDD-HHMM-<slug>/`
2. Tell subagent its directory path in the prompt
3. Read `FINDINGS.md` after completion

### Codex as Implementation Subagent

Use **Codex CLI** for long, focused implementation tasks.

**Launch command:**
```bash
echo "Read <relative/path/to/SPEC.md> and follow the instructions." | \
  codex exec --model gpt-5.3-codex --dangerously-bypass-approvals-and-sandbox \
  -C "/path/to/claude-chief-of-staff" - 2>&1
```

Run with `run_in_background: true`, check with `TaskOutput`.

---

## Background Process Guidelines

- Synchronous by default for short commands
- Long commands: run in background, check output ONCE when ready
- Record task IDs, kill processes when done

---

## Active Tasks

| Run ID | Description | Status | Working Directory |
|--------|-------------|--------|-------------------|

---

## Timestamps

Always verify via `date` command. Never hallucinate timestamps.
Format: `YYYY-MM-DD HH:MM EST` for docs, `YYYYMMDD-HHMM` for file/directory names.
