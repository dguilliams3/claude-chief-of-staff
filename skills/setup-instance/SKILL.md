---
name: setup-instance
description: Use when setting up a new instance for the first time, when a user says "set me up", "get started", "configure", or "deploy" — walks through infrastructure creation, data source configuration, deployment, and visual customization interactively.
---

# Setup Instance — Interactive Wizard

This skill walks a new user from zero to a fully deployed, customized instance. It covers infrastructure, data sources, deployment, prompt tuning, and visual design.

## Ground Rules

- **Single source of truth:** `setup-run/setup-log.md` (append-only). Every answer, action, and result is appended here. Never edit or delete earlier entries.
- **Resumable:** Every phase begins by reading `setup-run/setup-log.md`. If context compacts mid-session, re-read the log to recover full state.
- **Cross-platform:** No Windows-only or Unix-only assumptions. Use Node/npx where possible. Quote paths. Use forward slashes.
- **Interactive:** Ask, confirm, then act. Never assume answers.

---

## Phase 0: Setup Questionnaire

_Goal: Gather all inputs upfront so later phases can run with minimal interruption._

1. Create `setup-run/` directory at repo root.
2. Create `setup-run/setup-log.md` with this initial content:

```markdown
# Setup Log
Started: <timestamp>

## Phase 0: Questionnaire
```

3. Present a welcome message:
   > Welcome! This wizard will set up your personal AI briefing system from scratch. I'll ask a few questions first, then handle the rest.

4. **Account inventory** — ask and record:
   - Do you have a Cloudflare account? (yes/no)
   - Are you logged into Wrangler? (`wrangler whoami` — run if they say yes)

5. **Tool inventory** — check and record each:
   - Node.js installed? (`node --version`)
   - Claude Code installed? (`claude --version`)
   - cloudflared installed? (`cloudflared --version`)
   - Wrangler installed? (`npx wrangler --version`)

6. **Data source inventory** — ask:
   - Which data sources do you want to connect? Options:
     - Jira (project tracking)
     - Fireflies (meeting transcripts)
     - MS365 (email, calendar, Teams)
     - Other / custom MCP server
   - Record selections.

7. **Domain preference** — ask:
   - Do you have a custom domain you want to use, or use free Cloudflare URLs?
   - If custom: what domain? Which subdomains for dashboard and tunnel?

8. **Resource naming** — ask (or propose sensible defaults based on their
   instance name / username):
   - `D1_DATABASE_NAME` (e.g. `my-briefings`, `jdoe-briefings`)
   - `R2_BUCKET_NAME` (e.g. `my-exports`, `jdoe-exports`; can be skipped if
     they opt out of exports)
   - `WORKER_NAME` (e.g. `my-cos-worker`)
   - `PAGES_PROJECT_NAME` (e.g. `my-dashboard`)
   - `TUNNEL_NAME` (e.g. `my-tunnel`, must be unique within their Cloudflare account)

   These feed into later phases — every wrangler / cloudflared command in
   Phases 2+ uses the captured names. DO NOT copy the fork's template
   defaults into commands verbatim; substitute the user's chosen names.

9. **Summary + confirm:** Present all answers in a table (including the
   resource names from step 8). Ask: "Does this look right? Any changes
   before we proceed?"

10. Append all answers to `setup-run/setup-log.md` under Phase 0 — include
    an explicit `## Resource names` section with each captured value so
    subsequent phases can read them reliably.

---

## Phase 1: Prerequisites Check

_Goal: Install or verify every tool needed for later phases._

1. Read `setup-run/setup-log.md` — check Phase 0 answers for what's missing.

2. For each missing prerequisite, guide installation:
   - **Node.js:** Direct user to https://nodejs.org or suggest `nvm`/`fnm`.
   - **Claude Code:** `npm install -g @anthropic-ai/claude-code`
   - **Wrangler:** `npm install -g wrangler`
   - **cloudflared:** Direct to Cloudflare's install docs for their platform.

3. If Cloudflare account = NO:
   - Guide user to create account at https://dash.cloudflare.com/sign-up
   - After creation: `wrangler login`
   - Verify: `wrangler whoami`

4. If Cloudflare account = YES but not logged in:
   - Run `wrangler login`
   - Verify: `wrangler whoami`

5. Re-verify all tools are available. Append results to `setup-run/setup-log.md`:

```markdown
## Phase 1: Prerequisites
- Node.js: v<version> OK
- Claude Code: v<version> OK
- Wrangler: v<version> OK, account: <email>
- cloudflared: v<version> OK
```

---

## Phase 2: Cloudflare Infrastructure

_Goal: Create D1 database, configure Worker, set secrets._

1. Read `setup-run/setup-log.md` for current state.

2. Install project dependencies:
   ```
   npm install
   ```

3. Create D1 database:
   ```
   wrangler d1 create <D1_DATABASE_NAME>
   ```
   Capture the `database_id` from output.

4. Edit `server/worker/wrangler.toml`:
   - Set the `database_id` field under `[[d1_databases]]` to the captured value.

5. Apply D1 migrations:
   ```
   cd server/worker && wrangler d1 migrations apply <D1_DATABASE_NAME> --remote
   ```

6. Generate a random auth token:
   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   Save this as COS_TOKEN.

7. Set the Worker secret:
   ```
   wrangler secret put COS_TOKEN
   ```
   Paste the generated token when prompted.

8. Append to `setup-run/setup-log.md`:

```markdown
## Phase 2: Cloudflare Infrastructure
- D1 database: <D1_DATABASE_NAME> (id: <database_id>)
- Migrations applied: OK
- COS_TOKEN generated: <first 8 chars>...
- Worker secret set: OK
```

---

## Phase 3: Tunnel Setup

_Goal: Create a cloudflared tunnel so the local API is reachable from the Worker._

1. Read `setup-run/setup-log.md` for domain preference from Phase 0.

2. Authenticate cloudflared:
   ```
   cloudflared tunnel login
   ```

3. Create the tunnel:
   ```
   cloudflared tunnel create <TUNNEL_NAME>
   ```
   Capture the tunnel UUID from output.

4. **If custom domain** (from Phase 0):
   - Route DNS:
     ```
     cloudflared tunnel route dns <TUNNEL_NAME> <subdomain.domain.com>
     ```
   - Set `TUNNEL_URL` to `https://<subdomain.domain.com>`

5. **If no custom domain:**
   - Route DNS via the user's Cloudflare-managed zone:
     ```
     cloudflared tunnel route dns <TUNNEL_NAME> <subdomain.domain.com>
     ```
   - Set `TUNNEL_URL` to `https://<subdomain.domain.com>`
   - Note: Quick Tunnels (`cloudflared tunnel --url`) generate ephemeral hostnames that change on restart. Always use a named tunnel for production.

6. Create `server/worker/wrangler.toml` from the example file:
   ```
   cp server/worker/wrangler.toml.example server/worker/wrangler.toml
   ```
   Then edit `server/worker/wrangler.toml`:
   - Set `name` to your Worker name
   - Set `TUNNEL_URL` to the resolved tunnel URL
   - Set `database_id` to your D1 database ID (from Phase 1)

7. Create cloudflared config file at `~/.cloudflared/config.yml`:
   ```yaml
   tunnel: <tunnel-uuid>
   credentials-file: <path-to-credentials-json>

   ingress:
     - hostname: <tunnel-hostname>
       service: http://localhost:3141
     - service: http_status:404
   ```

8. Append to `setup-run/setup-log.md`:

```markdown
## Phase 3: Tunnel
- Tunnel UUID: <uuid>
- Tunnel URL: <url>
- Config written: ~/.cloudflared/config.yml
- wrangler.toml updated with TUNNEL_URL
```

---

## Phase 4: MCP Server Configuration

_Goal: Connect Claude Code to the user's selected data sources via MCP._

1. Read `setup-run/setup-log.md` for data source selections from Phase 0.

2. For each selected data source, run the appropriate command:

   - **Jira:**
     ```
     claude mcp add atlassian -- npx -y @anthropic-ai/mcp-remote@latest https://mcp.atlassian.com/v1/sse
     ```

   - **Fireflies:**
     ```
     claude mcp add fireflies -- npx -y @anthropic-ai/mcp-remote@latest https://mcp.fireflies.ai/sse
     ```

   - **MS365:**
     ```
     claude mcp add ms365 -- npx -y @anthropic-ai/mcp-remote@latest https://mcp.ms365.com/sse
     ```

   - **Custom:** Ask the user for the MCP server name and URL, then:
     ```
     claude mcp add <name> -- npx -y @anthropic-ai/mcp-remote@latest <url>
     ```

3. Each `mcp add` command will trigger an OAuth flow in the browser. Guide the user:
   > A browser window will open for authentication. Log in and authorize access, then return here.

4. Verify all servers are connected:
   ```
   claude mcp list
   ```

5. Append to `setup-run/setup-log.md`:

```markdown
## Phase 4: MCP Servers
- Configured: <list of server names>
- Verification: all servers responding
```

---

## Phase 5: Environment & Deploy

_Goal: Write env config, deploy Worker and frontend._

1. Read `setup-run/setup-log.md` for COS_TOKEN and tunnel URL.

2. Write `.env` at repo root:
   ```
   COS_TOKEN=<token-from-phase-2>
   COS_WORKER_URL=https://placeholder.workers.dev
   ```

3. Deploy the Worker:
   ```
   cd server/worker && wrangler deploy
   ```
   Capture the deployed Worker URL from output.

4. Update `.env` with the actual Worker URL:
   ```
   COS_WORKER_URL=<deployed-worker-url>
   ```

5. Build the frontend:
   ```
   cd app && npm install && VITE_API_URL=<worker-url> npm run build
   ```
   On Windows (PowerShell), use:
   ```
   cd app && npm install && $env:VITE_API_URL="<worker-url>"; npm run build
   ```

6. Deploy the frontend:
   ```
   cd app && wrangler pages deploy dist --project-name <PAGES_PROJECT_NAME>
   ```
   Capture the Pages URL from output.

7. Append to `setup-run/setup-log.md`:

```markdown
## Phase 5: Deployment
- Worker URL: <worker-url>
- Frontend URL: <pages-url>
- .env written: OK
```

---

## Phase 6: Validation

_Goal: Verify the full stack works end-to-end._

1. Read `setup-run/setup-log.md` for all URLs.

2. Test Worker health:
   ```
   curl -s <worker-url>/health
   ```
   Expect a 200 response.

3. Start the local API server and tunnel:
   - Start local API: `npx tsx server/local/server.ts`
   - Start tunnel: `cloudflared tunnel run <TUNNEL_NAME>`
   - (Guide user to run these in separate terminals, or use the start script if available.)

4. Run a test briefing:
   ```
   npx tsx agent/cli.ts work --new-session
   ```

5. Verify the briefing synced to D1:
   ```
   curl -s -H "Authorization: Bearer <COS_TOKEN>" <worker-url>/briefings | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).length,'briefings found'))"
   ```

6. Present results to user:
   > Your system is live! Here are your URLs:
   > - Dashboard: <pages-url>
   > - API: <worker-url>
   > - Tunnel: <tunnel-url>

7. Append to `setup-run/setup-log.md`:

```markdown
## Phase 6: Validation
- Worker health: OK
- Test briefing generated: OK
- Briefing synced to D1: OK
- All URLs verified
```

---

## Phase 7: Prompt Customization

_Goal: Tailor briefing prompts to the user's work and interests. All customizations are written to the gitignored `local/` directory — never modify tracked prompt files._

1. Read `setup-run/setup-log.md` for data source selections.

2. Create `local/` and `local/briefings/` directories if they don't exist:
   ```
   mkdir -p local/briefings
   ```

3. **Persona** — ask about the user's identity and role:
   - "Tell me about yourself — your role, your team, what you're responsible for."
   - "What context should the AI have about you to make briefings useful?"
   - Based on the conversation, write `local/persona.md` — a natural-language description of who the user is, their role, responsibilities, and preferences.
   - **If `local/persona.md` already exists:** Read it, show the user what's there, and ask: "Want to update this, or keep it as-is?"

4. **Work briefing focus** — ask:
   - Which Jira projects should be included? (project keys)
   - What meeting patterns matter most? (standups, 1:1s, planning, all)
   - Any email patterns to watch? (specific senders, subjects, labels)
   - What should the briefing prioritize? (blockers, deadlines, decisions, status changes)
   - Write the focus instructions to `local/briefings/work-focus.md`.
   - **If file already exists:** Show current content, ask before overwriting.

5. **News/field briefing focus** — ask:
   - What topics to monitor? (AI/ML, industry-specific, competitors)
   - Specific companies or products to track?
   - Preferred sources? (arxiv, HN, specific blogs, newsletters)
   - How technical should field briefings be? (executive summary vs deep dive)
   - Write the focus instructions to `local/briefings/news-focus.md`.
   - **If file already exists:** Show current content, ask before overwriting.

6. **Community briefing feeds** (optional — only if the user wants a
   community digest):

   Community briefings pull items from RSS/GraphQL feeds the user configures.
   They ship with NO default feeds — each instance selects its own from the
   suggestion catalog at `agent/feeds/template-sources.ts` or defines custom.

   Ask: "Do you want a Community briefing? It digests items from RSS / GraphQL
   feeds you configure. Common use cases include tracking research papers,
   industry newsletters, or niche community forums."

   If **no**: skip this step. (The Community tab still appears in the UI
   because the type is registered, but the briefing will run with zero
   items until feeds are configured.)

   If **yes**:

   - Open `agent/feeds/template-sources.ts` and walk through the suggestion
     categories (finance, science, biotech, geopolitics, rationalism/AI,
     custom RSS). Ask which categories the user wants.

   - For each selected category, show the example URL(s) from the catalog
     and ask: "Use this source, pick a different URL, or skip?"

   - The user can also define fully custom feeds at this step — ask for:
     - `id` (short unique slug)
     - `name` (human-readable)
     - `kind` ("rss" or "graphql")
     - `url` (RSS URL) OR GraphQL endpoint + query

   - Write the selected feeds to `local/feeds.json` as an array matching the
     `FeedSource[]` discriminated-union shape in `agent/feeds/types.ts`:
     - **RSS feeds** use `feedUrl` (NOT `url`)
     - **GraphQL feeds** use `graphqlUrl` + `baseUrl` + optional `limit`

     Example covering both kinds:

     ```json
     [
       {
         "id": "nature-news",
         "name": "Nature News",
         "kind": "rss",
         "feedUrl": "https://www.nature.com/nature.rss"
       },
       {
         "id": "custom-feed-1",
         "name": "My team's RSS",
         "kind": "rss",
         "feedUrl": "https://example.com/feed.xml"
       },
       {
         "id": "example-graphql",
         "name": "Example GraphQL Feed",
         "kind": "graphql",
         "graphqlUrl": "https://api.example.com/graphql",
         "baseUrl": "https://example.com",
         "limit": 20
       }
     ]
     ```

   - **If `local/feeds.json` already exists:** show current entries, ask
     whether to add/replace/keep.

   - Optional: write `local/briefings/community-focus.md` with any
     per-topic guidance ("prioritize engineering papers", "skip op-eds",
     etc.) — the community prompt consumes this via `readLocalOverride`.

7. **General focus context** (optional) — ask:
   - "Is there anything that should apply to ALL briefing types? Company context, current priorities, things to always watch for?"
   - If yes: write to `local/briefing-focus.md`.
   - If no: skip (no file created).

8. Run a test briefing to show the output:
   ```
   npx tsx agent/cli.ts work --new-session
   ```

9. Ask: "How does this look? Want to adjust anything?"

10. Iterate if needed. Edit the relevant `local/` file and re-run test briefings.

11. Append to `setup-run/setup-log.md`:

```markdown
## Phase 7: Prompt Customization
- Persona written: local/persona.md
- Work focus written: local/briefings/work-focus.md
- News focus written: local/briefings/news-focus.md
- Community feeds: local/feeds.json (or "skipped")
- Community focus: local/briefings/community-focus.md (or "skipped")
- General focus: local/briefing-focus.md (or "skipped")
- Test briefing approved: yes/no
```

**Important:** All prompt customizations go in `local/`. NEVER modify `agent/prompts/components.ts`, `agent/briefings/work/config.ts`, or `agent/briefings/news/config.ts` directly. These tracked files contain defaults that are used when no local override exists.

---

## Phase 8: Visual Customization

_Goal: Let the user choose palette, layout, and icons for their dashboard. Design iteration happens inline — preview HTMLs are generated and opened in the browser. All customizations are written to the gitignored `local/` directory._

1. Read `setup-run/setup-log.md` for current state.

2. Ask: "Want to customize the visual design, or use the defaults?"
   - If defaults: skip to step 15.

3. Create `setup-run/previews/round-1/` directory.

4. **Palette options:** Generate 3 self-contained HTML files using `skills/setup-instance/templates/palette-preview.html` as the template:
   - `setup-run/previews/round-1/palette-a.html`
   - `setup-run/previews/round-1/palette-b.html`
   - `setup-run/previews/round-1/palette-c.html`

   Each HTML file:
   - Is fully self-contained (Tailwind CDN, inline styles)
   - Uses `skills/setup-instance/templates/mock-briefing.json` for sample data
   - Renders a realistic dashboard preview with a distinct color palette
   - Can be opened directly in any browser

5. Tell the user:
   > I've generated 3 palette previews. Open these files in your browser:
   > - <absolute path to palette-a.html>
   > - <absolute path to palette-b.html>
   > - <absolute path to palette-c.html>
   > Which direction do you prefer? (A, B, C, or describe what you want instead)

6. Based on feedback:
   - If they pick one: proceed with that palette.
   - If they want changes: create `setup-run/previews/round-2/` with refined options. Repeat until satisfied.

7. **Layout variants:** Once palette is chosen, generate 2-3 layout option HTMLs in a new round directory:
   - Vary card arrangement, header style, information density.
   - Same palette, different layout structures.
   - User picks or requests changes.

8. **Icon options:** Once layout is chosen, generate icon preview using `skills/setup-instance/templates/icon-canvas.html`:
   - Show 3-4 icon/favicon options rendered on a canvas.
   - User picks one.

9. Write the chosen palette to `local/theme.css` as CSS `@theme` overrides. Only include tokens that differ from the base Warm Stone palette in `app/src/index.css`:
   ```css
   @theme {
     --color-background: #f5f3ef;
     --color-accent: #2563eb;
     /* ...only overridden tokens */
   }
   ```
   - **If `local/theme.css` already exists:** Show current content, ask before overwriting.

10. Write PWA identity to `local/pwa.json` — only include fields that differ from defaults:
    ```json
    {
      "name": "My Briefings",
      "short_name": "Briefings",
      "theme_color": "#2563eb"
    }
    ```
    - **If `local/pwa.json` already exists:** Show current content, ask before overwriting.

11. Export the chosen icon as favicon and PWA icons. Save source files to `local/icons/` and copy the built PNGs to `app/public/`. Note: icon changes in `app/public/` are tracked — this is an intentional exception to the local-only rule since PWA icons must be served from the public directory.

12. Rebuild the frontend:
    ```
    cd app && npm run build
    ```

13. Redeploy:
    ```
    cd app && wrangler pages deploy dist --project-name <PAGES_PROJECT_NAME>
    ```

14. Verify: `git status` should show NO unstaged changes from the customization. Only `local/` and `.env` should be modified (both gitignored).

15. Append to `setup-run/setup-log.md`:

```markdown
## Phase 8: Visual Customization
- Palette: <chosen palette name or "defaults"> → local/theme.css
- PWA identity: <chosen name or "defaults"> → local/pwa.json
- Icon: <chosen icon or "defaults">
- Rebuilt and deployed: OK
- git status: clean (no tracked file changes)
```

**Important:** All visual customizations go in `local/`. NEVER modify `app/src/index.css` or `app/layers/pwa/manifest.ts` directly. These tracked files contain defaults that are used when no local override exists.

---

## Phase 9: Completion

_Goal: Summarize everything and leave the user with a clear picture of their system._

1. Read `setup-run/setup-log.md` for all details.

2. Save final config to `setup-run/final/config-summary.json`:
   ```json
   {
     "timestamp": "<ISO timestamp>",
     "infrastructure": {
       "d1_database": "<D1_DATABASE_NAME>",
       "d1_database_id": "<id>",
       "worker_url": "<url>",
       "frontend_url": "<url>",
       "tunnel_uuid": "<uuid>",
       "tunnel_url": "<url>"
     },
     "data_sources": ["<list of configured MCP servers>"],
     "prompts": {
       "work_focus": "<summary>",
       "field_focus": "<summary>",
       "voice": "<tone>"
     },
     "design": {
       "palette": "<name or defaults>",
       "layout": "<name or defaults>",
       "icon": "<name or defaults>"
     }
   }
   ```

3. Present the final summary:
   > Setup complete! Here's your system:
   >
   > **URLs**
   > - Dashboard: <frontend-url>
   > - API: <worker-url>
   > - Tunnel: <tunnel-url>
   >
   > **Data Sources:** <list>
   >
   > **Briefing Focus:** <work + field summaries>
   >
   > **Design:** <palette + layout + icon>
   >
   > **Next steps:**
   > - Run `npx tsx agent/cli.ts work --new-session` for a work briefing
   > - Run `npx tsx agent/cli.ts news --new-session` for a news briefing
   > - Visit your dashboard to see results
   > - Set up cron jobs for automated briefing generation

4. Append completion to `setup-run/setup-log.md`:

```markdown
## Phase 9: Completion
- Config summary saved: setup-run/final/config-summary.json
- Completed: <timestamp>
```
