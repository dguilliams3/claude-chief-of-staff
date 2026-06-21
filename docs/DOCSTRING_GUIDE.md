# Docstring & Comment Guide

> Code is Context. Docstrings are the primary interface for AI-assisted development — they survive context compaction, power cross-project synthesis, and create a machine-parseable dependency graph. Verbosity is intentional and non-negotiable. Docstrings do NOT count toward file line limits.

## General Principles

1. **Document behavior, not mechanics.** Explain side effects (D1 writes, tunnel proxying, MCP calls, store mutations).
2. **Keep comments close to code.** Prefer block docstrings for exported symbols, inline comments only when logic is non-obvious.
3. **Describe data contracts.** Clarify the shape of objects stored in D1, returned via Worker API, or held in Zustand store.
4. **Note assumptions.** E.g., "Assumes bearer token is set" or "Caller is always authenticated."
5. **Update or delete stale comments immediately.** A wrong cross-reference is worse than none.
6. **Navigation is additive.** When adding Navigation sections to existing docstrings, preserve all existing content.
7. **No ticket IDs or RUN IDs in docstrings.** They rot immediately. Use date + brief reason instead.

## JSDoc/TSDoc Convention for Exported Items

Every exported function, component, hook, type, and store action receives a docstring block. Use JSDoc (`/** */`) syntax for TypeScript-native IDE support.

### Section Order

1. Summary line (one sentence)
2. Extended description (if needed)
3. `@param` / `@returns` / `@throws` (standard JSDoc)
4. Navigation section (always last)

### Navigation Section

The Navigation section creates a machine-parseable dependency graph. It goes inside the JSDoc block using tagged lines:

```typescript
/**
 * Fetches the latest briefings from the Worker API, keyed by type.
 *
 * @returns Record of briefings keyed by type string
 * @throws On network error or non-200 response
 *
 * Upstream: `pwa/src/store/index.ts::fetchAndSet`
 * Downstream: Worker `GET /briefings/latest` -> D1 query
 * Coupling: `pwa/src/api.ts::headers` — auth token must be set first
 * Do NOT: Call without setting auth token — will 401 silently
 */
export async function fetchBriefings(): Promise<Record<string, unknown>> {
```

### Navigation Tags

| Tag | Purpose | When Required |
|-----|---------|---------------|
| `Upstream:` | What calls or triggers this | Always for exports with consumers |
| `Downstream:` | What this calls or delegates to | Always for exports that call other modules |
| `Coupling:` | Files that must change together | When two files are tightly bound |
| `Tested by:` | Test file path(s) | **Always** when tests exist for this symbol |
| `Do NOT:` | Known failure mode or antipattern | When there's a learned failure mode |
| `Pattern:` | Named pattern being followed | When following a repo convention |
| `See also:` | Related code or documentation | When context lives elsewhere |

### Cross-Reference Format

Always use `file::symbol` with backtick wrapping. Paths are relative to project root.

```
`pwa/src/store/index.ts::fetchAndSet`
`worker/src/routes/briefings.ts::handleGetLatest`
`pwa/src/components/SectionCard.tsx::SectionCard`
```

**Never use line numbers.** They rot on the next edit. Symbol names survive refactoring.

### Required Tags by File Type

| File Type | Required Tags |
|-----------|--------------|
| **Store** (`store/index.ts`) | Upstream, Downstream, Do NOT, Pattern |
| **API client** (`api.ts`) | Upstream, Downstream, Coupling |
| **Worker routes** (`worker/src/`) | Upstream, Downstream, Do NOT |
| **Components** (all `.tsx`) | Upstream, Downstream, Do NOT (if known) |
| **Hooks** (`hooks/*.ts`) | Upstream, Downstream, Pattern |
| **Types** (`types/*.ts`) | Coupling, See also |
| **Scripts** (`scripts/`) | Do NOT, See also |

## File-Level (Module) Docstrings

Every file gets a JSDoc block at the top, before imports. This is the file's identity:

```typescript
/**
 * Zustand store — single source of truth for auth, briefings, view state, and history.
 *
 * MAIN ENTRY POINT for all PWA state mutations.
 *
 * Used by: All components via `useStore((s) => s.field)` selectors
 * See also: `pwa/src/api.ts` — HTTP client this store delegates to
 * Do NOT: Split into multiple stores unless statement count exceeds 200
 * Do NOT: Add React Context providers — Zustand IS the shared state
 */
import { create } from 'zustand';
```

### Module Docstring Content

| Section | Purpose |
|---------|---------|
| Summary | One sentence: what this file does |
| Semantic hook | `MAIN ENTRY POINT`, `STABLE CONTRACT`, `PRESENTATIONAL` — aids AI discovery |
| `Used by:` | What imports or depends on this file |
| `See also:` | Related files, docs, or specs |
| `Do NOT:` | File-level antipatterns (architectural constraints) |

## React Components

```typescript
/**
 * SectionCard renders a collapsible briefing section with severity indicators.
 * Uses CSS grid-template-rows for smooth expand/collapse animation.
 *
 * @param section - Briefing section data (key, label, content, severity)
 * @param defaultOpen - Whether section starts expanded
 * @param index - Position in list, used for stagger animation delay
 *
 * Upstream: `pwa/src/components/TodayView.tsx::TodayView`
 * Downstream: `pwa/src/components/Markdown.tsx::Markdown`
 * Pattern: grid-collapse — `section-collapse` CSS class with `data-open` attribute
 * Do NOT: Use conditional rendering (`{open && ...}`) — breaks collapse animation
 */
export function SectionCard({ section, defaultOpen, index }: { ... }) {
```

Guidelines:
- Describe visual behavior and interaction patterns
- Note animation/transition approaches
- Call out non-obvious prop effects (e.g., `index` controls stagger timing)
- Document accessibility attributes (aria-expanded, aria-label)

## Store Actions

```typescript
/**
 * Triggers a new briefing generation via the local API tunnel.
 * Starts polling for completion every 15s until a new briefing ID appears.
 *
 * Upstream: `pwa/src/components/AppHeader.tsx::AppHeader` — "New Briefing" button
 * Downstream: `pwa/src/api.ts::triggerBriefing` -> Worker -> tunnel -> local bash
 * Coupling: `pwa/src/store/index.ts::silentRefresh` — polling calls this
 * Do NOT: Call when `triggering` is already true — early return guard exists
 * Do NOT: Reduce poll interval below 15s — tunnel latency makes faster polling wasteful
 */
async triggerBriefing() { ... }
```

## Types and Interfaces

```typescript
/**
 * Shape of a briefing list item returned by `GET /briefings`.
 * Intentionally lighter than full Briefing — no sections or sessionId.
 *
 * Coupling: `worker/src/routes/briefings.ts` — must match D1 query projection
 * See also: `pwa/src/types/briefing.ts::Briefing` — full object shape
 */
export interface BriefingListItem { ... }
```

Only document types when:
- The name + fields aren't self-documenting
- There's a coupling constraint (DB schema must match)
- The type is used across module boundaries

## Inline Comments

- Explain **why**, not **what**.
- Use `// WORKAROUND:` prefix for temporary fixes, with context on when to remove.
- Use `// DO NOT:` prefix for inline antipattern guards.

```typescript
// WORKAROUND: MINGW bash mangles paths with backslashes.
// Convert C:\Users\... to /c/Users/... for shell exec. Remove if we drop Windows support.
const bashPath = winPath.replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`);

// DO NOT: Use taskkill /F /IM node.exe — kills ALL Node processes including Claude Code.
```

## Semantic Hooks

Embed discoverable terms in docstrings to help AI agents find critical code:

| Hook | Meaning |
|------|---------|
| `MAIN ENTRY POINT` | Primary entry for a subsystem |
| `STABLE CONTRACT` | Interface that external consumers depend on |
| `PRESENTATIONAL` | Pure display component, no side effects |
| `STORE-FIRST` | Pattern where hook/handler writes to store, components read from store |

## Function Signatures — Named Parameters

All exported functions use options objects for parameters, including single-param functions. This makes call sites self-documenting and teaches the convention to every agent or human who reads the code.

```typescript
// YES — self-documenting at call site and in grep results:
fetchBriefingById({ id })
sendFollowUp({ sessionId, question })
triggerBriefing({ type })

// NO — positional args hide meaning:
fetchBriefingById(id)
sendFollowUp(sessionId, question)
```

**Exceptions:**
- React component props (already destructured by convention)
- Simple setters where the value is obvious from the function name (e.g., `setAuthToken(token)`)
- Private/internal helpers where the function name makes the parameter obvious

When doing docstring passes, also convert function signatures to named parameters in the same edit. The convention is self-teaching: agents reading call sites absorb the pattern and propagate it to new code.

**Status:** Convention decided. Full refactor of existing signatures is a separate initiative — apply to new code immediately, convert existing code opportunistically.

---

## Test Traceability (Bidirectional)

Tests and source code must reference each other. This creates bidirectional navigation:
function → tests AND tests → function.

**In the source file** — add `Tested by:` to the function's docstring:

```typescript
/**
 * Read a local override file if it exists.
 *
 * @param relativePath - Path relative to local/ (e.g. 'persona.md')
 * @returns File content as string, or null if no override present.
 *
 * Tested by: `agent/__tests__/local-config.test.ts`
 */
export function readLocalOverride(relativePath: string): string | null {
```

**In the test file** — module docstring references what it tests:

```typescript
/**
 * Tests for readLocalOverride() — local config file loading with fallback.
 *
 * Tests: `agent/local-config.ts::readLocalOverride`
 * See also: `local/README.md` — documents the override file format
 */
describe('readLocalOverride', () => {
```

**Rules:**
- Every function with tests gets a `Tested by:` tag in its docstring
- Every test file gets a module docstring with `Tests:` referencing source `file::symbol`
- When writing new tests, update BOTH the test file AND the source docstring in the same commit
- Multiple test files? List them all: `Tested by: \`foo.test.ts\`, \`foo.integration.test.ts\``

## When NOT to Add Navigation

- Private/unexported functions (navigation is optional)
- Domain barrel `index.ts` files (these define public domain boundaries — add a module docstring with Upstream/See also, but individual re-exports don't need nav tags)
- CSS-only files (`index.css` — use regular comments instead)
- Single-use helpers defined and consumed in the same file

## Checklist Before Closing a Run

- [ ] All new exported functions/components have docstrings
- [ ] Navigation sections added to any symbol with cross-module dependencies
- [ ] Side effects and D1 tables / API endpoints touched are mentioned
- [ ] `Tested by:` references point to test files that actually exist (bidirectional — test files also reference source)
- [ ] Removed or renamed functions had their old docstrings deleted
- [ ] `Do NOT:` tags added for any discovered failure modes
- [ ] Cross-references use `file::symbol` format (not `file:linenum`)
- [ ] No ticket IDs or RUN IDs appear in any docstring
- [ ] File-level module docstrings present on all new/modified files
