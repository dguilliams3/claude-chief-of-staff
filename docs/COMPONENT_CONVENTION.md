# Component Convention

> Every component is a directory. No exceptions.
> "Code is Context" — consistency beats brevity. An agent landing anywhere in `components/` should encounter the same structure.

---

## Directory Structure

```
ComponentName/
  index.tsx              # Barrel — re-exports the main component (and any public sub-components)
  ComponentName.tsx       # Main component logic
  components/            # Sub-components scoped to this feature (only when needed)
    SubComponent.tsx
  hooks/                 # Component-scoped hooks (only when needed)
    useHookName.ts
```

### Rules

1. **Every component is a directory**, even leaf components. A 15-line `SeverityDot` gets the same `index.tsx` + `SeverityDot.tsx` structure as a 120-line `FollowUpBar`.

2. **`index.tsx` is a barrel, not an implementation.** It re-exports from `ComponentName.tsx`. No logic, no JSX — just `export { ComponentName } from './ComponentName'`.

3. **`components/` and `hooks/` sub-dirs are created only when there's something to put in them.** Don't create empty directories.

4. **Sub-components are private by default.** They're imported by the parent component, not re-exported from `index.tsx`, unless explicitly needed by siblings or consumers.

5. **No `index.tsx` over 100 statements** (per ARCHITECTURE_CONSTRAINTS). Barrels should be 1-5 lines.

---

## Examples

### Leaf component (directory wrapper only)

```
Card/
  index.tsx          # export { Card } from './Card';
  Card.tsx           # The component
```

### Feature component with sub-components

```
FollowUpBar/
  index.tsx          # export { FollowUpBar } from './FollowUpBar';
  FollowUpBar.tsx    # Orchestrator — imports from ./components/ and ./hooks/
  components/
    ChatBubble.tsx
    TypingIndicator.tsx
    DrawerHandle.tsx
  hooks/
    useDrawer.ts
```

### Feature component with hooks only

```
AppHeader/
  index.tsx
  AppHeader.tsx
  hooks/
    useHeaderMeta.ts
```

---

## Docstring Requirements

Each file in a component directory should have a module-level docstring following `docs/DOCSTRING_GUIDE.md`:

- **`index.tsx`**: No docstring needed (barrel only).
- **`ComponentName.tsx`**: Full docstring with `Used by`, `See also`, `Do NOT` tags.
- **Sub-components**: Docstring with `Upstream` (parent component) and `Downstream` (what it renders).
- **Hooks**: Docstring with `Used by` and return type description.

---

## Import Resolution

### Path aliases (`@/`)

All imports that cross module boundaries use the `@/` alias (maps to `src/`):

```typescript
// Cross-module — always use @/
import { useStore } from '@/store';
import type { Briefing } from '@/types/briefing';
import { useRelativeTime } from '@/hooks/useRelativeTime';
import { AppHeader } from '@/components/AppHeader';
```

### Sibling imports (relative)

Imports within `components/` that reference other components stay relative:

```typescript
// Inside SectionCard/SectionCard.tsx — referencing sibling components
import { Card } from '../Card';
import { SeverityDot } from '../SeverityDot';

// Inside FollowUpBar/FollowUpBar.tsx — referencing own sub-components
import { ChatBubble } from './components/ChatBubble';
import { useDrawer } from './hooks/useDrawer';
```

### Why this split?

- `@/` for anything outside the current component tree — eliminates `../../` chains
- Relative for siblings and children — keeps the component self-contained and portable

### Config

- `tsconfig.app.json`: `"baseUrl": "."`, `"paths": { "@/*": ["./src/*"] }`
- `vite.config.ts`: `resolve: { alias: { '@': path.resolve(__dirname, 'src') } }`

---

## Zustand Selector Rules

### NEVER create new references in selectors

Zustand uses `useSyncExternalStore` under the hood, which compares selector return values with `Object.is`. If a selector returns a **new reference** on every call, React enters an infinite re-render loop (`forceStoreRerender` → `updateStoreInstance` → repeat).

```typescript
// BAD — creates a new [] every call → infinite re-render loop (React error #185)
const history = useStore((s) => s.followUpHistory[id] ?? []);
const items = useStore((s) => s.data?.items || []);

// GOOD — stable fallback reference, same object identity every time
const EMPTY: FollowUpEntry[] = [];
const history = useStore((s) => s.followUpHistory[id] ?? EMPTY);

// GOOD — select the parent and handle the fallback outside the selector
const historyMap = useStore((s) => s.followUpHistory);
const history = historyMap[id] ?? EMPTY;
```

This applies to any selector that derives a new object or array:
- `?? []` or `?? {}` — use a module-level constant instead
- `.map()` / `.filter()` inside selectors — memoize or move outside
- Object spread `{ ...state.foo, extra: true }` — use `useShallow` from `zustand/react/shallow`

---

## Shared Library Candidates

The following components are candidates for extraction into a shared `packages/ui/` package in a future run. They have no project-specific business logic and could serve multiple front-end projects:

| Component | Why |
|-----------|-----|
| `Card` | Generic container with shadow/border |
| `SeverityDot` | Reusable status indicator |
| `SeverityBadge` | Reusable severity label |
| `Markdown` | Prose rendering with theme-aware styles |
| Theme tokens (`index.css` @theme block) | Warm Stone palette |
| Typography primitives | font-display, font-body, font-mono |

Extraction is out of scope for the current run. When it happens, the directory structure stays the same — components just move from `pwa/src/components/` to `packages/ui/src/`.

---

## Relationship to Domain-Driven Modules

This convention covers **UI component** directory structure. A broader principle applies to non-UI code: **domain-driven module organization** (see `docs/ARCHITECTURE_CONSTRAINTS.md`).

The two conventions are complementary:

| Layer | Convention | Example |
|-------|-----------|---------|
| **UI components** | This doc — component directory with index.tsx barrel | `components/ChatThread/` |
| **Shared utilities** | Domain module — directory with colocated logic | `lib/polling/` |
| **Domain concepts** | Domain module — types + API + helpers together | `domain/conversation/` |
| **Store slices** | Domain module — one slice per domain concept | `store/followUpSlice.ts` |

The key principle is the same at every layer: **organize by concept, not by file type.** A domain concept's types, API calls, helpers, and (optionally) store slice live together — not scattered across `types/`, `api.ts`, `store/`, and `helpers/`.
