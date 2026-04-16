# Visual Direction — CoS PWA

> Living document. Updated as Dan's preferences are confirmed through implementation.
> Source: Front-End Design Council (RUN-20260305-2225), Visual Review Round 01 (2026-03-06).
> Visual review artifacts: `runs/CLAUDE-RUNS/RUN-20260305-2301-impl-spec-council/visual-review/`

---

## North Star

**Ambient Jarvis.** An always-open desktop tab that surfaces attention-worthy items and fades into the background otherwise. Dark mode is correct not for morning-eye comfort, but because an always-open tab needs to be low-noise at rest. FLAG/WARN cards glow when they need to; INFO cards stay quiet.

**Previously:** "Clean like Claude/Gmail." Still true for chrome and layout, but the consumption context is desktop-ambient, not phone-at-7am.

---

## Palette: "Warm Stone" (Inverted Surfaces)

The key design move: **body is lighter, cards are darker insets.** This creates automatic card separation, and the warmer body surface makes the warmth perceptible at typical screen lightness.

| Token | Hex | RGB | Usage |
|-------|-----|-----|-------|
| `--color-background` | `#2d2824` | `rgb(45, 40, 36)` | Page background — warm stone |
| `--color-surface` | `#1c1815` | `rgb(28, 24, 21)` | Card backgrounds — darker insets |
| `--color-surface-raised` | `#262220` | `rgb(38, 34, 32)` | Hover states, raised elements |
| `--color-border` | `#3a332d` | `rgb(58, 51, 45)` | Card borders |
| `--color-border-subtle` | `#221d19` | `rgb(34, 29, 25)` | Dividers within cards |
| `--color-primary` | `#e8e2d9` | `rgb(232, 226, 217)` | Primary text — warm off-white |
| `--color-secondary` | `#b8afa3` | `rgb(184, 175, 163)` | Body text — warm gray |
| `--color-muted` | `#887e73` | `rgb(136, 126, 115)` | Metadata, timestamps |
| `--color-accent` | `#c87941` | `rgb(200, 121, 65)` | Accent — burnt copper |
| `--color-accent-dim` | `#9c5e33` | `rgb(156, 94, 51)` | Accent borders, subtle references |
| `--color-chrome` | `#a58c73` | `rgb(165, 140, 115)` | System UI text — copper chrome family |
| `--color-severity-info` | `#a08a70` | `rgb(160, 138, 112)` | Info — warm muted ("noted") |
| `--color-severity-warn` | `#c8a03c` | `rgb(200, 160, 60)` | Warn — amber ("attention") |
| `--color-severity-flag` | `#e07050` | `rgb(224, 112, 80)` | Flag — coral ("action needed") |

### Surface Inversion (LOCKED)
Previous model: dark body, slightly-less-dark cards. New model: body is warm stone (lighter), cards are dark insets (darker). Cards gain depth by contrast with the lighter body, reinforced by subtle warm box-shadows.

### Accent Rules
The accent color is for **interactive elements only**: the Generate button (filled copper), active tab underlines, focus rings. NOT for emphasis, brand, status, or decoration. Severity colors handle status. Typography handles emphasis.

### Chrome Text Layer
All system UI chrome (inactive tabs, meta line, History/Generate labels) uses the copper chrome family (`--color-chrome`) at varying opacities. This gives the UI a cohesive warm identity without competing with content.

### Severity Style
**Left-border accent + badge.** FLAG and WARN expanded cards get a 4px left border in their severity color. FLAG cards also get a subtly warmer background (`rgb(32, 26, 22)`).
- Severity dot before section title matches severity color
- Badge is pill-shaped with severity-colored text and border
- No gradient left edges — solid left border replaces the gradient approach

---

## Typography

### Font Stack
- **Display:** Instrument Serif (app title + section headings — editorial personality)
- **Body:** DM Sans (the workhorse — everything functional)
- **Mono:** JetBrains Mono (system chrome, badges, tabs, timestamps)

### Scale (5 tokens)

| Token | Font | Weight | Size | Use |
|-------|------|--------|------|-----|
| `--text-display` | Instrument Serif | 400 italic | 20px | App title "Chief of Staff" |
| `--text-heading` | Instrument Serif | 400 italic | 15px | Section card titles |
| `--text-body` | DM Sans | 400 | 14-15px | Prose content, chat text |
| `--text-small` | DM Sans | 400 | 13px | Captions, secondary descriptions |
| `--text-meta` | JetBrains Mono | 500 | 10-11px | Tabs, badges, meta line, chrome |

### Section Label Font: LOCKED — Instrument Serif
**Decision (2026-03-06):** Instrument Serif italic at 15px for section titles. This is the single fastest way to shift vibe from "dashboard" to "editorial." Headings in serif, body in sans, data in mono = newspaper rhythm.

Previously the serif font appeared exactly once (app title). Spreading it to section titles creates the visual rhythm of a curated briefing.

### Minimum Text Size
No text smaller than 9px for badge labels (JetBrains Mono at 9px with letter-spacing is legible). Body text minimum 12px.

---

## Icons

- **Library:** Lucide (outlined, 1.5px stroke)
- **Usage:** Icons alongside text labels, never replacing them
- **Sizes:** 20px standard, 16px in tight spaces
- **Color:** Inherits parent text color. No independent icon colors except severity dots.
- **Current set:** ChevronDown, Send, RefreshCw, Clock, ArrowLeft. Add more only when needed.

---

## Brand

- **Minimal presence** once past login. Name may change from "Chief of Staff."
- **Header:** Title standalone on its own row. Navigation and actions below.
- **PWA icon:** Monogram in accent-color circle. Easy to regenerate if name changes.
- **Don't** anchor visual identity to the current name.

---

## Header Structure (LOCKED)

Three-row header, each row with distinct purpose:

```
Chief of Staff                               ← Row 1: title, standalone
[Work]  [News]              [+ Generate]     ← Row 2: type tabs + filled copper action
Current  History · #1 · 8m ago               ← Row 3: temporal sub-tabs + inline meta
─────────────────────────────────────────
cards...
```

### Semantic Rationale
- **Generate** is grouped with Work/News because the action is "generate a new Work briefing" — scoped by neighboring tabs
- **Title** stands alone as identity
- **Current/History** is subordinate navigation, not a peer of the type axis
- **Meta** is inline on the secondary nav row (no cost — generation uses Claude Code usage, not user tokens)

### Display Labels
- `morning` type displays as **"Work"**
- `field` type displays as **"News"**
- Underlying data keys remain `morning`/`field`

### Tab Styling
- Plain text + copper underline (not pill boxes)
- Primary tabs: JetBrains Mono 11px, uppercase, 0.3px tracking
- Secondary tabs: JetBrains Mono 10px
- Active: copper text + underline
- Inactive: chrome color (`--color-chrome`)

### Generate Button
- Filled copper background, dark text
- JetBrains Mono 10px uppercase
- `border-radius: 6px`, padding `7px 14px`
- At <340px width, collapse to just "+" icon

---

## Layout & Spacing

- **Single column** at all breakpoints. Briefings are sequential narrative, not dashboard widgets.
- **Section gaps:** 10-12px between cards (tighter than before — cards now have depth via shadow)
- **Card padding:** 12-14px horizontal, 12px vertical (tighter for denser information)
- **No custom spacing tokens** — Tailwind IS the spacing system
- **Mobile:** Full-bleed minus 16px gutters. Tablet: max-w-xl centered. Desktop: max-w-2xl.

---

## Interaction Model

### Briefing History
**Briefings are objects, not pages.** Like files in a directory, servers in Discord, chats in Messenger.
- Browsable list/gallery of past briefings accessed via "History" sub-tab
- Each is a discrete object you tap into and back out of
- Show: type, date, time, section count, highest severity

### Chat / Follow-Up
- **Current:** Keep bottom bar, improve it
- **Future:** Will evolve into always-on Claude assistant — architect so chat can be promoted to its own dedicated view later
- Don't over-invest in chat UX now, but don't paint yourself into a corner

### Card Depth (LOCKED)
Cards are dark insets with warm copper glow shadow:
```css
box-shadow: 0 2px 10px rgba(200, 121, 65, 0.05), 0 1px 3px rgba(0, 0, 0, 0.2);
```
FLAG cards: 4px left border in coral, slightly warmer background.
WARN cards: 4px left border in amber.
INFO cards: no left border (default).

### Collapse Behavior
```
flag/warn severity → always open
first section → always open
all sections info → open first two
otherwise info → collapsed
```

### Loading States
- **Initial load:** Static gray skeleton rectangles in final layout position
- **Briefing generation (2-3 min):** Pulsing wordmark + "This usually takes 2-3 minutes. We'll have it ready when you're back."
- **Follow-up response:** Typing indicator with accessible text

### Pull-to-Refresh
**No.** Explicit refresh button in header. Chrome native PTR disabled via `overscroll-behavior-y: none`.

---

## Animations

- **Expand/collapse:** `grid-template-rows: 0fr → 1fr` (replaces max-height hack)
- **Card enter:** translateY(8px) + fade, 300ms, 60ms stagger
- **All animations** must respect `prefers-reduced-motion: reduce`
- **Severity pulse:** 3-4 cycles max, not infinite
- **Philosophy:** Animations should be felt, not seen. If you notice the animation, it's too much.

---

## Accessibility Baseline

These are non-negotiable, not "nice to have":
1. `prefers-reduced-motion` CSS block on all animations
2. `aria-label` on all form inputs
3. `role="alert"` on error messages
4. `aria-expanded` on collapsible sections
5. Visible focus indicators (0.5 opacity minimum, not 0.08)
6. No text smaller than 12px
7. All interactive elements ≥ 48px touch target
8. Accent color must achieve 4.5:1 on both background and surface

---

## What This Is NOT

- Not a design system. It's a reference for one app.
- Not exhaustive. If something isn't specified here, use good judgment and keep it simple.
- Not frozen. Update this doc as implementation reveals what works and what doesn't.

---

*Last updated: 2026-03-06*
*Source: Design Council SYNTHESIS.md + Visual Review Round 01 (REVIEW.md + v6 mockup)*
