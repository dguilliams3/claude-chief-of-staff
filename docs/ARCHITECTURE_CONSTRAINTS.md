# Architecture Constraints

> Hard rules that apply to all changes. Violations are bugs, not trade-offs.
> For API routes and data model, see `docs/SPEC.md`.
> For project conventions and task execution, see `CLAUDE.md`.

---

## Absolute Constraints

These are non-negotiable. Every PR, every commit, every "quick fix" must respect them.

### 1. No Anthropic API Key

The agent runner invokes `claude --print` headless, using existing Claude Code authentication. Claude Code IS the LLM layer. There is no `ANTHROPIC_API_KEY` env var, no direct API calls to `api.anthropic.com`, no SDK imports from `@anthropic-ai/sdk`. If a feature requires LLM inference, it goes through the CLI.

### 2. MCP-Native Data Access

Data sources (Jira, Fireflies, MS365, etc.) are accessed by Claude Code via MCP servers during inference. The TypeScript codebase does not import Jira clients, Fireflies SDKs, or any data-source-specific libraries. The prompt tells Claude which MCP tools to use; Claude calls them. If a user's MCP servers are not configured, the briefing degrades gracefully (Claude reports what it could not access).

### 3. Read-Only

This system reads and synthesizes. It never writes back to data sources. No Jira ticket creation, no Fireflies annotations, no email sending. The only writes are to D1 (briefing storage) and local files (transient briefing JSON).

### 4. Append-Only Storage

Briefings, sessions, conversations, and messages are immutable once written. No UPDATE or DELETE operations on D1 tables (exception: briefings uses INSERT OR REPLACE for idempotent sync, which is a DELETE+INSERT under the hood). If data needs correction, insert a new row.

### 5. No Local Database

All durable persistence goes through Cloudflare D1 via the Worker API. The local filesystem holds transient briefing JSON (overwritten each run) and the gitignored `local/` config directory. There is no SQLite file, no IndexedDB, no local Postgres. If D1 is unreachable, the system continues to function (briefings generate locally, sync retries later).

### 6. Cloudflare Only

The deployment target is Cloudflare: Workers (API), Pages (PWA), D1 (storage), cloudflared (tunnel). No AWS, no Vercel, no Supabase, no Firebase. This constraint keeps the operational surface area minimal and the free tier sufficient for individual instances.

---

## Deployment Constraints

### Deployment Order

When both Worker and frontend change:

1. Deploy Worker first (`cd server/worker && npx wrangler deploy`)
2. Deploy frontend second (`cd app && npx wrangler pages deploy dist --project-name cos-dashboard --branch main`)

The frontend may reference new API routes or response shapes. Deploying it before the Worker creates a window where the PWA calls endpoints that don't exist yet.

### One Instance Per Person

Each team member deploys their own Worker, D1 database, and Pages site. There is no shared instance. The `local/` directory holds per-person config; `wrangler.toml` holds per-person Cloudflare resource IDs. Both are gitignored.

### Secrets Never in Config Files

`COS_TOKEN` is stored as a Cloudflare Worker secret (via `wrangler secret put`) and in the local `.env` file (gitignored). It never appears in `wrangler.toml`, `package.json`, or any tracked file.

---

## Code Constraints

### TypeScript Everywhere

All application code is TypeScript in strict mode. No `.js` files in `agent/`, `server/`, or `app/src/`. The only JavaScript is generated output (build artifacts, bundled worker).

### Import Discipline

See `CLAUDE.md` for the full import rules. The critical constraints:

- `app/src/` uses `@/` path aliases for cross-directory imports, `./` for same-directory only, never `../`
- `agent/` and `server/worker/` use standard relative imports (max 2 levels up)
- Cross-workspace imports use npm workspace names (e.g., `import { x } from 'agent/module'`)

### Code Size Limits

Individual route files, components, and modules stay under 200 lines. If a file grows beyond that, extract a sub-module. The prompt component system (`agent/prompts/`) is the model: small, composable, lazy-loaded.

### Local Overrides Always Win

When a `local/` override file exists (e.g., `local/persona.md`, `local/theme.css`), it takes precedence over the tracked default. Override loading is lazy (read at access time, not cached at startup) so changes take effect on the next briefing run or build without restarting services.

### camelCase API Contract

All JSON responses from both Worker and local API use camelCase field names. D1 columns use snake_case. Route handlers map between them. The PWA never sees snake_case.

---

## What These Constraints Enable

The constraints above produce a system where:

- A new team member clones, runs `/setup-instance`, and has a fully independent instance in under an hour
- All personal config is gitignored — `git pull` never overwrites customizations
- The Cloudflare free tier covers everything (D1 5MB, Workers 100K req/day, Pages unlimited)
- No API keys to manage beyond the self-generated `COS_TOKEN`
- No infrastructure to maintain beyond `npm start` (local API + tunnel)
