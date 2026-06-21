# Memory & Context Optimization

> **Purpose**: Strategies for efficient context management when working with AI coding agents
> in the claude-chief-of-staff repository.

---

## Context Loading Strategy

### Progressive Disclosure Principle

**Don't load everything at once. Load based on task type.**

```
Task Type                -> Load These Documents
---------------------------------------------
Quick command/fix        -> CLAUDE.md only
Debugging error          -> CLAUDE.md + error logs
Adding new feature       -> CLAUDE.md + docs/SPEC.md
Understanding arch       -> docs/SPEC.md -> docs/ARCHITECTURE_CONSTRAINTS.md
Worker/D1 changes        -> server/worker/src/db/schema.ts + migrations/
Frontend changes         -> app/src/ structure + Conventions in CLAUDE.md
```

---

## Document Loading Order

### Tier 1: Always Available (Cache These)

**Load at conversation start, keep in working memory:**

1. **CLAUDE.md** -- Navigation hub and essential quick reference
2. **Key constants:**
   ```
   - Local API port: 3141
   - Import pattern (app/src/): @/ for cross-directory, ./ for same directory only
   - Import pattern (agent/, server/worker/): standard relative imports
   - Cross-workspace: npm workspace imports (e.g., import from 'agent/claude-cli')
   - Storage: Cloudflare D1 via Drizzle ORM (no local DB)
   - API framework: Hono (both local and Worker)
   - Frontend: Vite + React + Tailwind + Zustand
   ```
3. **Core architectural rules:**
   - No Anthropic API key -- Claude Code IS the LLM
   - Read-only system -- never writes back to data sources
   - Cloudflare only -- no Vercel, Netlify, or AWS

### Tier 2: Task-Specific (Load on Demand)

**Load only when task requires:**

| Document | When to Load | Approx Size |
|----------|-------------|-------------|
| `docs/SPEC.md` | Architecture decisions, API routes, briefing types | ~15K tokens |
| `docs/ARCHITECTURE_CONSTRAINTS.md` | Hard rules, deployment order, code size limits | ~8K tokens |
| `server/worker/src/db/schema.ts` | D1 schema changes, query debugging | ~3K tokens |
| `app/src/store/` | State management changes | ~5K tokens |
| `agent/prompts/` | Briefing prompt changes | ~5K tokens |

### Tier 3: Deep Dives (Load Sparingly)

**Only load for complex architectural work:**

| Document | When to Load |
|----------|-------------|
| `docs/SPEC.md` (full) | Major refactoring |
| `server/worker/migrations/` | Schema changes |
| `app/vite.config.ts` | Build/PWA config changes |

---

## Context Refresh Strategy

### When to Refresh Context

**Indicators you need to reload:**
- Suggesting patterns that don't exist in current codebase
- Using import paths that were refactored away
- Referencing endpoints that were deprecated
- Assuming file structure that changed

**Refresh triggers:**
- Major codebase changes (file moves, deletions)
- After prolonged conversation (>50 messages)
- When user corrects architectural assumptions
- After significant upstream changes

### Selective Refresh Pattern

```
# Don't refresh everything - refresh what changed

# Scenario: User says "we removed the sync endpoint"
Refresh: docs/SPEC.md (has endpoint list)
Keep:    CLAUDE.md conventions (unchanged)
Keep:    app/ structure (unchanged)

# Scenario: User says "we changed port from 3141 to 8080"
Refresh: CLAUDE.md (has port numbers)
Keep:    docs/SPEC.md (no hardcoded ports)
```

---

## Task-Based Loading Patterns

### Pattern 1: Quick Fix Task

**Example**: "Fix the typo in schema.ts line 96"

**Load Strategy**:
```
1. Read target file only (schema.ts)
2. Fix typo
3. Done

No docs needed - file path is explicit
```

**Token Usage**: ~500 tokens (file only)

### Pattern 2: Implement New Feature

**Example**: "Add a new briefing type for weekly reports"

**Load Strategy**:
```
1. CLAUDE.md -> "Adding a New Briefing Type" section
2. One existing briefing config as reference (agent/briefings/)
3. agent/registry.ts to see registration pattern
4. Implement following pattern exactly
```

**Token Usage**: ~10,000 tokens (1 doc section + 2 files)

### Pattern 3: Debug Production Error

**Example**: "Getting 500 on /briefings/sync endpoint"

**Load Strategy**:
```
1. CLAUDE.md -> Quick Reference for relevant commands
2. server/worker/src/routes/ -> Find the sync handler
3. server/worker/src/db/schema.ts -> Check schema
4. Fix: Update handler logic
```

**Token Usage**: ~8,000 tokens (2-3 files)

### Pattern 4: Understand Architecture for Refactoring

**Example**: "Should we consolidate the local and worker API routes?"

**Load Strategy**:
```
1. docs/SPEC.md -> Understand API design
2. docs/ARCHITECTURE_CONSTRAINTS.md -> Read design rationale
3. server/local/ and server/worker/src/ -> See current patterns
4. Make informed decision
```

**Token Usage**: ~30,000 tokens (2 docs + code exploration)

---

## Caching Strategies

### What to Cache Between Tasks

**Cache for entire conversation:**
- Port 3141 for local API
- `@/` import alias for app/src/
- Hono for API framework, D1 for storage
- Briefing type registration pattern
- Component tier rules (ui/ vs components/ vs views/)

**Cache for current task only:**
- Specific file contents
- Route handler implementation details
- Schema details

**Never cache:**
- Dynamic data (D1 query results)
- User-specific configurations (local/ overrides)
- Temporary error states

---

## Smart File Reading

### When to Read Full Files vs Targeted Sections

**Read full file when:**
- File is <300 lines
- Need to understand overall structure
- Making changes that could affect multiple areas
- First time encountering this file

**Read targeted sections when:**
- File is >500 lines
- Know exact function/class needed
- Making isolated change
- Have seen file structure before

### Pattern: Lazy Loading Imports

```
# Don't read every imported file - trace only what you need

# User: "Fix error in briefings sync handler"
# handler imports: schema, callClaude, authMiddleware

Step 1: Read sync handler (find error location)
Step 2: Error is in schema.insert() call
Step 3: NOW read schema.ts (only because error is there)
Step 4: Don't read callClaude or authMiddleware (not involved)

Token savings: ~4,000 tokens (didn't read 2 unnecessary files)
```

---

## Decision Trees for Context Loading

### Decision Tree: Do I Need to Load Docs?

```
Is the file path explicit in user request?
|-- YES: Read file directly, no docs needed
└-- NO: Continue...

Do I know the exact pattern needed?
|-- YES: Read CLAUDE.md conventions -> Find pattern -> Implement
└-- NO: Continue...

Is this architectural/design question?
|-- YES: Read docs/SPEC.md -> Understand -> Decide
└-- NO: Continue...

Is this a debugging task?
|-- YES: Read relevant source files -> Diagnose
└-- NO: Read CLAUDE.md Quick Reference for commands
```

### Decision Tree: Which Doc to Load?

```
Task involves...

|-- Commands/quick lookup? -> CLAUDE.md Quick Reference
|-- Import rules? -> CLAUDE.md Conventions
|-- API routes/briefing types? -> docs/SPEC.md
|-- Hard constraints/deployment? -> docs/ARCHITECTURE_CONSTRAINTS.md
|-- D1 schema? -> server/worker/src/db/schema.ts
|-- New developer setup? -> README.md + /setup-instance skill
└-- Simple code change? -> No docs, read code directly
```

---

## Practical Tips

### Tip 1: Use CLAUDE.md as Your Compass

**Always start here.** It's the navigation hub that tells you where to find specific information.

```
Bad workflow:  Load all docs -> Search for answer
Good workflow: CLAUDE.md -> Find relevant section -> Load specific doc
```

### Tip 2: Cache Constants and Patterns

**These rarely change and are referenced frequently:**
- Local API port: 3141
- Import pattern: `@/` for cross-directory in app/src/, `./` for same directory
- Never use `../` to escape a component directory in app/src/
- Hono for API, D1 + Drizzle for storage, Zustand for state
- Briefing registration: config in `agent/briefings/<type>/`, register in `agent/registry.ts`
- Component tiers: `ui/` (pure) -> `components/` (uses store) -> `views/` (full pages)

### Tip 3: Lazy Load Everything Else

**Only load when you have concrete evidence you need it:**
- Implementation details (load when implementing)
- Route handler internals (load when modifying)
- Schema details (load when writing queries)

### Tip 4: Know When to Stop Loading

**Stop loading context when you can answer:**
1. What file(s) do I need to modify?
2. What pattern should I follow?
3. What are the critical constraints?

**If you can answer these, start implementing. Load more only if blocked.**

---

**Last Updated:** 2026-03-12
