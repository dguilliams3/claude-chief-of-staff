# PWA & Briefing Type Design

> Working design document. Dan to review and iterate before implementation.

---

## Part 1: Briefing Types

### Current: `morning` — Operational State

What exists today. Jira + Fireflies cross-referenced. "What's happening, what's drifting, what's untracked."

### Proposed: `field` — AI/Agent Landscape Intelligence

**Purpose:** Weekly filtered intelligence on the tools and frameworks Dan actually uses. Not a news feed — a skeptical signal-vs-noise assessment.

**Sources:**
- Claude's training knowledge (current through mid-2025, but can reason about announced releases)
- Hugging Face (we have MCP access) — model releases, trending papers
- GitHub releases via MCP or web fetch — LangGraph, LangChain, Anthropic SDK, OpenAI SDK, Claude Code itself
- Anthropic blog / changelog
- Context7 (we have MCP access) — library documentation changes

**Sections:**

| Key | Label | What it contains |
|-----|-------|-----------------|
| `SIGNAL` | Actually Matters | Changes that concretely affect Dan's stack. New Claude model? Only matters if it changes the API surface or pricing. LangGraph adds native skill packaging? That's signal. Be specific about WHY it matters to Dan. |
| `NOISE` | Getting Attention, Skip It | Things trending that Dan can safely ignore and why. "New model benchmarks well but doesn't change your API surface" = noise. |
| `WATCH` | Too Early to Call | Not signal yet, but worth checking next week. New framework that could replace something in Dan's stack but isn't proven. |
| `DAN_STACK` | Your Stack Specifically | Explicit connections to: SQL-as-prompt architecture, Claude Code CLI automation, MCP integrations, Hono/Cloudflare Workers, agent orchestration patterns, the tools Dan is actively building with. |

**Skepticism directive:** The default failure mode is hype amplification. Bias strongly toward "this probably doesn't change anything." A new model that benchmarks well but doesn't change Dan's API surface is NOISE. A framework release that adds something Dan currently builds manually is SIGNAL.

### Proposed: `client` — Client Intelligence Roll-Up

**Purpose:** Per-client status synthesis. Different from the morning briefing (which is cross-cutting) — this is focused on one client at a time.

**Invocation:**
```bash
./run-briefing.sh client "east-penn"
./run-briefing.sh client "sharp"
./run-briefing.sh client "blachford"
```

**Sources:** Same as morning (Jira + Fireflies) but filtered to one client.

**Sections:**

| Key | Label | What it contains |
|-----|-------|-----------------|
| `STATUS` | Where Things Stand | Current state of the engagement — active workstreams, recent deliverables, upcoming milestones |
| `COMMITMENTS` | What You Promised | Action items from meetings attributed to Dan or Astral, with dates and context |
| `RISKS` | What Could Go Sideways | Stale deliverables, missed follow-ups, scope creep signals, unresolved client questions |
| `NEXT_TOUCH` | Next Interaction | When's the next meeting? What should Dan prepare? What does the client expect to see? |

**Why this is separate from morning:** The morning briefing gives Dan a 10,000-foot view across everything. Client briefings zoom into one engagement when he's about to hop on a call or needs to prep. Different cadence — morning is daily, client is on-demand before meetings.

---

## Part 2: Shared TypeScript Types

These types are shared between the API (Hono Worker) and the PWA (React). Published as a shared package or just a `types/` directory imported by both.

```typescript
// types/briefing.ts

export type BriefingType = 'morning' | 'field' | 'client';

export type Severity = 'info' | 'warn' | 'flag';

export interface BriefingSection {
  key: string;
  label: string;
  content: string;       // Markdown
  severity: Severity;
}

export interface BriefingMetadata {
  sourcesSampled: string[];
  runDurationMs: number;
  costUsd: number;
  sessionResumed: boolean;
  briefingNumber: number;
  clientSlug?: string;    // Only for type === 'client'
}

export interface Briefing {
  id: string;             // UUID
  type: BriefingType;
  generatedAt: string;    // ISO timestamp
  sessionId: string;      // Claude session ID for follow-ups
  sections: BriefingSection[];
  metadata: BriefingMetadata;
}

// API response types

export interface LatestBriefings {
  morning: Briefing | null;
  field: Briefing | null;
  clients: Record<string, Briefing>;  // keyed by client slug
}

export interface FollowUpRequest {
  sessionId: string;
  question: string;
}

export interface FollowUpResponse {
  answer: string;         // Markdown
  sessionId: string;      // Same session, extended
}
```

---

## Part 3: PWA Architecture

### Design Philosophy

- **The briefing content IS the UI.** No nav chrome beyond what's needed.
- **Mobile-first, dark theme.** Dan reads this on his phone at 7am.
- **Installable PWA.** Home screen icon, standalone mode, offline fallback.
- **Minimal interactivity.** Read briefing, maybe ask a follow-up. That's it.

### Component Tree

```
<App>
  <BriefingShell>                    // Layout: header + content + follow-up
    <BriefingHeader>                 // Type selector + last updated + session info
      <TypeToggle />                 // morning | field | client:<slug>
      <MetaBadge />                  // "Briefing #4 · 2m ago · session resumed"
    </BriefingHeader>

    <BriefingContent>                // Scrollable section list
      <SectionCard                   // One per section
        key={section.key}
        label={section.label}
        severity={section.severity}
        content={section.content}    // Rendered as markdown
      />
      ...
    </BriefingContent>

    <FollowUpBar>                    // Sticky bottom bar
      <FollowUpInput />             // Text input
      <FollowUpResponse />          // Markdown response, inline below input
    </FollowUpBar>
  </BriefingShell>

  <OfflineBanner />                  // "Last updated X ago" when offline
  <PullToRefresh />                  // Re-fetch (Phase 2) or trigger run (Phase 3)
</App>
```

### Component Details

#### `<SectionCard>`
The core visual unit. Each briefing section gets a card.

```
┌─────────────────────────────────────┐
│ ● What Jira Says              warn  │  ← severity dot + label + badge
├─────────────────────────────────────┤
│                                     │
│  ### Open/In-Progress: 100+         │  ← markdown content rendered
│                                     │
│  **Artemis (ART) — 77 issues**     │
│  27 In Progress | 50 To Do          │
│  ...                                │
│                                     │
└─────────────────────────────────────┘
```

- **Severity indicator:** Left border or dot color
  - `info` → muted/default (gray or dim blue)
  - `warn` → amber/yellow
  - `flag` → red
- **Collapsed by default?** Maybe. Could show first ~3 lines with expand. Depends on how long sections get. The morning briefing sections are substantial — might want DRIFT and BLOCKERS expanded by default (they're the high-signal sections) and others collapsed.
- **Markdown rendering:** Use a lightweight renderer (react-markdown or similar). Content includes headers, bold, lists, code blocks, blockquotes.

#### `<TypeToggle>`

Horizontal pill selector at the top:

```
[ Morning ]  [ Field ]  [ East Penn ▾ ]
```

- Morning and Field are static tabs
- Client is a dropdown that shows configured client slugs
- Active tab has a filled/highlighted state
- Tapping a tab fetches the latest briefing for that type

#### `<FollowUpBar>`

Sticky at the bottom of the screen. Minimal.

```
┌─────────────────────────────────────┐
│  Ask a follow-up...          [Send] │
└─────────────────────────────────────┘
```

- Sends: `POST /briefings/follow-up { sessionId, question }`
- API proxies to local machine: `echo "$question" | claude --print --resume $sessionId`
- Response renders inline as markdown, below the input
- Multiple follow-ups stack (mini-conversation within the briefing context)

#### `<MetaBadge>`

Subtle metadata line below the header:

```
Briefing #4 · 2 min ago · session resumed · $0.40
```

Shows: briefing number, relative time, session status, cost (optional/toggle).

### Color System (Dark Theme)

```
Background:     #0a0a0f  (near-black)
Card bg:        #141420  (slightly lifted)
Card border:    #1e1e2e  (subtle)
Text primary:   #e0e0e8  (off-white)
Text secondary: #8888a0  (muted)
Severity info:  #4a6fa5  (muted blue)
Severity warn:  #d4a843  (amber)
Severity flag:  #c94040  (red)
Accent:         #7b68ee  (medium slate blue — Ms. Frizzle's magic bus purple?)
```

### Data Flow

```
PWA startup
  |
  +--> GET /briefings/latest
  |      Returns: { morning: Briefing|null, field: Briefing|null, clients: {...} }
  |      PWA renders morning by default
  |
  +--> Service worker caches response
  |      Offline: serve cached version + show "Last updated X ago" banner
  |
  User taps "Field" tab
  |
  +--> Reads from cached /briefings/latest response (already fetched)
  |      No additional API call unless pull-to-refresh
  |
  Pull-to-refresh
  |
  +--> Phase 2: GET /briefings/latest (re-fetch from API)
  +--> Phase 3: POST /briefings/trigger { type: "morning" }
  |      Triggers run on local machine via Tunnel
  |      Polls or waits for new briefing
  |
  Follow-up question
  |
  +--> POST /briefings/follow-up { sessionId, question }
  |      Response: { answer: "markdown...", sessionId }
  |      Render inline below input
```

### PWA Manifest Essentials (iOS)

```json
{
  "name": "Chief of Staff",
  "short_name": "CoS",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0a0f",
  "theme_color": "#7b68ee",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

Plus iOS-specific meta tags:
```html
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="apple-touch-icon" href="/icon-180.png">
```

---

## Part 4: Prompt Template Expansion

### `field.md` prompt structure

Similar to morning.md but with different data gathering:

```
Today is {{DATE}} ({{DATE_HUMAN}}).

Generate Dan's weekly field intelligence briefing.

## Step 1: Gather Intelligence

Use available tools to check:
- Recent Anthropic model releases or API changes
- LangGraph/LangChain release notes
- Claude Code CLI updates
- Notable AI agent framework developments
- Any Hugging Face trending models or papers relevant to enterprise agents

## Step 2: Produce Sections

[SIGNAL, NOISE, WATCH, DAN_STACK definitions...]

## Relevance Filter

Dan's active stack:
- Claude Code CLI (headless automation via --print)
- MCP integrations (Jira, Fireflies, Hugging Face)
- Hono on Cloudflare Workers
- SQL-as-prompt architecture for prompt versioning
- React + Vite + Tailwind PWAs
- Enterprise agent platforms for manufacturing/quality clients
- Python for data analysis (pandas, scipy, sklearn)

If a development doesn't touch something in this list, it's NOISE unless there's a compelling reason it will within 3 months.
```

### `client.md` prompt structure

```
Today is {{DATE}} ({{DATE_HUMAN}}).
Client: {{CLIENT_SLUG}} ({{CLIENT_NAME}})

Generate a client intelligence briefing for {{CLIENT_NAME}}.

## Step 1: Gather Data

Use the Jira MCP to fetch issues related to {{CLIENT_SLUG}} projects: {{CLIENT_JIRA_PROJECTS}}.
Use the Fireflies MCP to search for meetings mentioning "{{CLIENT_NAME}}".

[STATUS, COMMITMENTS, RISKS, NEXT_TOUCH definitions...]
```

This needs a client config — a simple JSON mapping slugs to names and Jira project keys:

```json
// agent/clients.json
{
  "east-penn": {
    "name": "East Penn",
    "jira_projects": [],
    "search_terms": ["East Penn", "IPIR", "defect", "fault tree"]
  },
  "sharp": {
    "name": "Sharp",
    "jira_projects": ["IA", "ART"],
    "search_terms": ["Sharp", "NCR", "investigation agent"]
  },
  "blachford": {
    "name": "Blachford",
    "jira_projects": [],
    "search_terms": ["Blachford", "EDA"]
  }
}
```

---

## Part 5: Subagent Architecture for Briefings

### The Problem

A single `claude --print` call that fetches Jira data, Fireflies data, AND synthesizes them all in one prompt has two issues:

1. **Context pollution.** Raw Jira API responses (100+ tickets) and Fireflies transcripts (5 meetings worth of text) consume massive context. The synthesis quality degrades because Claude is juggling raw data and analysis in the same context window.
2. **Serialization.** MCP calls happen sequentially within one session. Jira fetch, then Fireflies fetch, then synthesis = slow.

### The Solution: Prompt-Directed Subagents

The morning prompt should instruct Claude to use subagents (via the Agent tool) to parallelize data gathering and keep the synthesis context clean:

```
## Step 1: Gather Data (Use Subagents)

Spawn two subagents IN PARALLEL to gather data:

### Subagent A: Jira Data Gatherer
- Use the Jira MCP to fetch all open and in-progress issues
- Group by project, include ticket keys, statuses, assignees, last update dates
- Return a structured summary (not raw API responses)
- Focus on: ticket counts per project, recently transitioned tickets, stale tickets (no update in 14+ days)

### Subagent B: Fireflies Data Gatherer
- Use the Fireflies MCP to fetch the 5 most recent meeting transcripts
- Extract: meeting titles, dates, participants, key discussion topics, action items with attributions
- Return a structured summary (not raw transcript text)

Wait for both subagents to complete before proceeding.

## Step 2: Synthesize (Main Thread)

Using the structured summaries from both subagents (NOT raw data), produce the 5 briefing sections...
```

### Why This Works

- **Parallel execution:** Jira and Fireflies fetches happen simultaneously, cutting ~30-60s off runtime
- **Context hygiene:** The main synthesis thread only sees structured summaries, not raw API/transcript data. Better synthesis quality.
- **Cost efficiency:** Subagents use smaller context windows. The main thread's context stays lean.

### For Field Briefings

The field briefing benefits even more from subagents:

```
Subagent A: Hugging Face Intelligence
  - Search for trending models/papers in enterprise AI, agents, RAG
  - Use hub_repo_search and paper_search tools

Subagent B: Framework Release Monitor
  - Check Context7 for recent doc changes in LangGraph, Anthropic SDK
  - Use resolve-library-id + query-docs tools

Subagent C: Client-Relevant News (optional)
  - Search for industry news relevant to current clients
  - Manufacturing quality (East Penn), healthcare compliance (Sharp)

Main Thread: Synthesis
  - Receive structured findings from all subagents
  - Apply relevance filter against Dan's stack
  - Produce SIGNAL/NOISE/WATCH/DAN_STACK sections
```

### For Client Briefings

```
Subagent A: Client Jira State
  - Fetch issues for client-specific Jira projects
  - Summarize status, blockers, recent activity

Subagent B: Client Meeting History
  - Search Fireflies for meetings mentioning client name
  - Extract commitments, action items, unresolved questions

Main Thread: Synthesis
  - Produce STATUS/COMMITMENTS/RISKS/NEXT_TOUCH sections
```

### Implementation Note

This changes the prompt design significantly. Instead of a single prompt that says "use Jira MCP and Fireflies MCP," the prompt says "spawn subagents to gather data, then synthesize." The `--print` mode supports the Agent tool — this was implicitly validated by the fact that it supports MCP tools. But we should explicitly test that `claude --print --permission-mode bypassPermissions` can spawn subagents.

**Test needed:** Can `claude --print` use the Agent tool to spawn subagents? If yes, this architecture works. If no, we fall back to sequential MCP calls in the main thread (current approach works, just slower and noisier context).

---

## Part 6: Open Questions for Dan

1. **Subagent test.** Can `claude --print` spawn subagents? Need to validate before committing to this architecture.

2. **Collapsed sections or full scroll?** The morning briefing is 5 substantial sections. On mobile, that's a lot of scrolling. Options:
   - All expanded (simple, but long)
   - All collapsed, tap to expand (compact, but more taps)
   - High-severity expanded, info collapsed (smart default)

2. **Follow-up conversation length.** Do follow-ups stay visible across app reopens? Or ephemeral (gone on refresh)?

3. **Client config.** The `clients.json` approach above — does that cover your current clients? Any others to add? Do you want to be able to add clients from the PWA or is editing JSON fine?

4. **Field briefing cadence.** Weekly? On-demand? Both? The prompt needs to know if it should compare to "last week's field briefing" or just report current state.

5. **Cost visibility.** Show cost per briefing in the UI? Or hide it? You're paying ~$0.40/briefing on Opus. With Sonnet it'd be cheaper but lower quality.

6. **Color scheme.** The purple accent (Magic Bus vibes) — yay or nay? Or prefer something more neutral?

---

*Last updated: 2026-03-05*
