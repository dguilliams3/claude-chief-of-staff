# Local Overrides

This directory holds per-user configuration. Everything here except this README is
gitignored — your customizations stay local and never create unstaged git changes.

## Quick Start

Run `/setup-instance` and the wizard will populate these files for you. Or create
them manually:

## Files

| File | What It Does |
|------|-------------|
| `persona.md` | Replaces the default system prompt persona. Describe who you are, your role, and what context the AI should have about you. |
| `briefing-focus.md` | General focus context injected into ALL briefing types. Optional. |
| `briefings/work-focus.md` | Overrides the work briefing's focus section. What should your morning briefing prioritize? |
| `briefings/news-focus.md` | Overrides the news briefing's focus section. What topics and areas should field intelligence cover? |
| `theme.css` | CSS `@theme` block overriding palette, fonts, or radii. Only include tokens you want to change — defaults fill in the rest. |
| `pwa.json` | Partial PWA manifest (name, colors, icons). Merged over defaults. |

## How It Works

The prompt compiler (`agent/prompts/components.ts`) and briefing configs check for
local override files at startup. If a file exists here, its content is used. If not,
the tracked defaults work out of the box.

The Vite build checks for `theme.css` and appends it after the base stylesheet.
The PWA manifest loader merges `pwa.json` over defaults at build time.

## Example: persona.md

```markdown
I'm a frontend engineer at Acme Corp. I lead the React migration project and
care about delivery timelines, client feedback, and team velocity. I also track
the AI/ML landscape for our internal tools strategy.

My Jira projects: ACME, TOOLS, INFRA
My meetings: Monday standup, Wednesday planning, Friday retro
```

## Example: theme.css

```css
@theme {
  --color-background: #f5f3ef;
  --color-surface: #ffffff;
  --color-accent: #2563eb;
  --font-display: 'Inter', system-ui, sans-serif;
}
```
