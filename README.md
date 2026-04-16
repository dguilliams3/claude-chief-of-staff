# Claude Chief of Staff

Personal AI briefing system — operational briefings + field intelligence, powered by Claude Code.

## What It Does

A headless agent runner generates structured morning briefings (work synthesis from Jira, Fireflies, MS365) and field intelligence (LLM/agent landscape monitoring). Briefings are stored in Cloudflare D1 and served through a mobile-first PWA.

## Distribution Model

Each operator runs their own instance end-to-end:

- Cloudflare account (Workers + D1 + Pages + optional R2) — free tier is sufficient
- Own domain (or a Cloudflare-provided `*.workers.dev` subdomain)
- Own bearer token (`COS_TOKEN`) protecting the Worker API
- Own MCP servers configured for Jira, Fireflies, MS365, etc.

No shared backend, no multi-tenant account system. Your briefings, your data, your Cloudflare bill (probably $0). Personal config (persona, focus areas, theme, feed sources) lives in the gitignored `local/` directory — your working tree stays portable.

The `/setup-instance` skill walks you through the full provisioning, or you can configure manually.

## Quick Start

1. **Clone and install:**
   ```bash
   git clone <this-repo>
   npm install
   ```

2. **Run the setup wizard** (in Claude Code):
   ```
   /setup-instance
   ```
   This walks you through Cloudflare setup, data source configuration, persona customization, and theme selection. All personal config goes to the gitignored `local/` directory — your working tree stays clean.

3. **Or set up manually** — see `CLAUDE.md` for the full project reference, conventions, and quick commands.

## Stack

| Layer | Tech |
|-------|------|
| Agent runner | TypeScript + `claude --print` (headless Claude Code CLI) |
| Prompts | TypeScript component composition (`agent/prompts/`) |
| Local API | Hono on Node (port 3141) |
| Cloud API | Hono on Cloudflare Workers |
| Storage | Cloudflare D1 (SQLite, Drizzle ORM) |
| Frontend | Vite + React + Tailwind v4 (PWA) |
| Tunnel | cloudflared (localhost ↔ Cloudflare) |
| Auth | Bearer token (CF secret + local env var) |

## Project Structure

```
├── agent/               # Briefing runner + prompt composition
│   ├── cli.ts           # Entry point: npx tsx agent/cli.ts work --new-session
│   ├── prompts/         # Prompt templates (component system)
│   └── briefings/       # Per-type briefing configs (work, news)
├── server/
│   ├── local/           # Hono on Node (localhost API for tunnel)
│   └── worker/          # Cloudflare Worker (D1 reads + tunnel proxy)
├── app/                 # Mobile-first PWA (Vite + React)
│   ├── src/
│   │   ├── views/       # Full pages (TodayView, HistoryView, ChatsView)
│   │   ├── components/  # Composed components (use store)
│   │   ├── ui/          # Pure presentational primitives
│   │   ├── store/       # Zustand state management
│   │   └── types/       # Cross-layer type contracts
│   └── layers/pwa/      # PWA manifest + icons
├── skills/              # Claude Code skills (setup-instance wizard)
├── local/               # Per-user overrides (gitignored)
└── CLAUDE.md            # Full project reference for AI + humans
```

## Customization

Each team member deploys their own Cloudflare instance. Personal customization lives in the gitignored `local/` directory:

| File | What it overrides |
|------|-------------------|
| `local/persona.md` | AI persona (role, context, voice) |
| `local/briefings/work-focus.md` | Work briefing focus areas |
| `local/briefings/news-focus.md` | News briefing focus areas |
| `local/theme.css` | Color palette and fonts |
| `local/pwa.json` | App name, colors, icons |

Run `/setup-instance` to populate these interactively, or create them by hand. See `local/README.md` for format details.

## Running Services

```bash
# Start local API + tunnel (requires npm install first)
npm start
```

This launches the local API (port 3141, or `COS_PORT` env var) and the cloudflared tunnel in parallel. Both must be running for the dashboard to trigger briefings and handle follow-up questions.

## Automated Briefing Generation (Cron)

Set up cron jobs to generate briefings automatically. The local API and tunnel must be running when cron fires (use `npm start` in a persistent terminal, tmux session, or system service).

**Example crontab** (edit with `crontab -e`):
```cron
# Morning work briefing at 7:30 AM
30 7 * * 1-5 cd /path/to/claude-chief-of-staff && npx tsx agent/cli.ts work --new-session >> /tmp/cos-work.log 2>&1

# Weekly field intelligence on Monday at 8:00 AM
0 8 * * 1 cd /path/to/claude-chief-of-staff && npx tsx agent/cli.ts news --new-session >> /tmp/cos-news.log 2>&1
```

**Windows Task Scheduler:** Create tasks that run `npx tsx agent/cli.ts work --new-session` in the repo directory on your preferred schedule.

## Common Commands

```bash
# Generate briefings manually
npx tsx agent/cli.ts work --new-session
npx tsx agent/cli.ts news --new-session

# Build frontend
cd app && npm run build

# Deploy
cd server/worker && npx wrangler deploy          # Worker API
cd app && npx wrangler pages deploy dist          # PWA

# Type check
npm run typecheck
```

## Rotating the Auth Token

Each instance has its own bearer token (`COS_TOKEN`) protecting its Worker API. To rotate your token:

1. Generate a new token (any random string)
2. Update the Worker secret: `cd server/worker && npx wrangler secret put COS_TOKEN`
3. Update your local env: set `COS_TOKEN=<new-token>` in `.env`
4. Re-enter the new token on your dashboard login screen

## Development Workflow

This repo ships opinionated tooling so forks stay maintainable:

| Tool | Purpose |
|------|---------|
| `scripts/preflight.sh` (`npm run preflight`) | Validates local setup before a run: env vars, wrangler placeholders, D1 bindings, tunnel config |
| `scripts/check-depersonalization.sh` | Refuses commits containing operator-specific identifiers (configurable regex). Enforced via `scripts/git-hooks/pre-commit` — enable with `git config core.hooksPath scripts/git-hooks` |
| `.claude/hooks/block-destructive-git.py` | Refuses `git reset --hard` / `git push --force` from Claude Code sessions |
| `.claude/hooks/spec-quality-gate.py` | Flags SPEC files missing required sections (numbered steps, GATEs, Agent Roster) |
| `.github/workflows/ci.yml` | Runs lint + typecheck + tests across all workspaces on every push/PR |
| `.github/dependabot.yml` | Weekly npm dep updates, workspaces-aware |

## Documentation

- **`CLAUDE.md`** — Full project reference: architecture, conventions, quick reference
- **`local/README.md`** — Override file formats and examples
- **`skills/setup-instance/SKILL.md`** — What the setup wizard does (9 phases)
- **`docs/MCP_SUBAGENT_STRATEGY.md`** — How the agent uses Sonnet subagents for MCP tool calls (context isolation pattern)
- **`docs/COUNCIL_GUIDE.md`** — Multi-model planning sessions (Claude + Codex + Gemini)
- **`docs/COMPONENT_CONVENTION.md`** — Three-tier component architecture (views / components / ui)
- **`docs/DOCSTRING_GUIDE.md`** — Cross-reference tag conventions (`Upstream:`, `Downstream:`, `Tested by:`)
- **`docs/VISUAL_DIRECTION.md`** — Design guidelines for the PWA
- **`docs/PWA_AND_BRIEFING_DESIGN.md`** — How briefings map to PWA views
