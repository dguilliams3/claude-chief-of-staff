# Council Guide — Multi-Agent Deliberative Planning

> Best practices for launching and orchestrating council-style multi-agent sessions.
> Derived from production council runs in artemis-east-penn-eda and artemis-agents.

---

## What Is a Council?

A council is a structured multi-agent session where several specialized agents analyze the same problem from different perspectives, cross-validate each other's work, and converge on recommendations through documented debate.

Councils are **not** task parallelism (splitting work into independent chunks). They are **deliberative** — agents read each other's work, challenge findings, and build on each other's analysis. The value comes from the cross-validation and the debate, not just the parallelism.

---

## When to Use a Council

**Good fits:**
- Architecture/design decisions with multiple valid approaches
- Analysis tasks requiring multiple perspectives (statistical, risk, temporal, etc.)
- Planning sessions where you want to stress-test assumptions
- Any task where groupthink is a real risk

**Bad fits:**
- Straightforward implementation (just do it)
- Tasks with a single obvious answer
- Work that can't meaningfully be split into perspectives
- Time-critical work where council overhead isn't worth it

---

## Council Structure

### Roles

Every council needs:

1. **Orchestrator** (you, the main thread) — launches agents, monitors progress, facilitates cross-talk, writes synthesis documents
2. **Specialized members** (3-8 agents) — each with a distinct analytical lens
3. **Devil's Advocate** (strongly recommended) — dedicated contrarian who challenges every conclusion
4. **Independent reviewer** (optional) — a separate model/agent that works in isolation, revealed later for cross-validation (e.g., Codex)

### Role Design Principles

- **Roles should be genuinely different perspectives**, not just different subtasks. "Frontend Agent" and "Backend Agent" is task parallelism. "Security Analyst" and "Performance Analyst" reviewing the same architecture is a council.
- **Each role should be able to challenge the others.** If Role A's work can't meaningfully be questioned by Role B, they shouldn't be in the same council.
- **Devil's Advocate is not optional for councils of 4+.** Without a dedicated contrarian, agents tend to converge too quickly and validate each other's assumptions.
- **Keep it under 8 members.** More agents = more cross-talk overhead. 4-6 is the sweet spot. 8 is the practical ceiling for rich cross-validation.

---

## Directory Layout

```
RUN-YYYYMMDD-HHMM-<slug>/
├── SPEC_v1.md                      # Council structure, rules, success criteria
├── TASK_LOG.md                     # Orchestrator progress (updated BETWEEN every step)
│
└── council/
    ├── README.md                   # Member roster + process overview
    ├── PRE-SYNTHESIS.md            # Team-only synthesis (before independent reveal, if applicable)
    ├── POST-SYNTHESIS.md           # Final synthesis (all perspectives integrated)
    ├── OPERATOR_DISCUSSION.md           # Append-only post-council discussion with the user
    │
    ├── <role-slug>/
    │   ├── SPEC.md                 # Role-specific mission, data sources, success criteria
    │   ├── NOTES.md                # Append-only, timestamped analysis log + cross-talk
    │   ├── scripts/                # Any code the agent writes (optional per council type)
    │   └── outputs/                # Artifacts — charts, CSVs, markdown docs
    │
    └── <independent>/              # Optional independent reviewer
        ├── SPEC.md
        ├── FINDINGS.md             # Not NOTES — independent agents don't cross-talk
        └── outputs/
```

---

## Member SPEC Template

Each member gets a SPEC.md that defines:

```markdown
# <Role Name> — <Council Name>

**Role:** <1-2 sentence mission statement>
**Model:** <e.g., Opus>
**Directory:** `council/<slug>/`
**Deliverable:** `NOTES.md` (append-only, timestamped)

---

## Your Mission

<2-3 paragraphs explaining what this role does, how it differs from other
members, and what unique perspective it brings. Be specific about the
analytical lens — not just "analyze X" but "analyze X through the lens of Y,
specifically looking for Z.">

---

## Data Sources / Context

<What files/APIs/context this member should load. Be explicit about paths.
Distinguish between "MUST load" (primary) and "reference only" (secondary).>

---

## Rules

1. <How to document work — append-only NOTES.md, timestamped>
2. <Cross-talk expectations — read others' NOTES.md, respond, challenge>
3. <Evidence standards — "hard numbers or it didn't happen">
4. <Output requirements — where to save artifacts>

## Core Questions You Must Address

1. <Specific question from this role's perspective>
2. <...>

## What Success Looks Like

<Concrete deliverables and quality bar. For devil's advocate: "Your NOTES.md
should make the other members uncomfortable. If everyone agrees with
everything, you failed.">
```

---

## Orchestrator Protocol

### Phase A: Setup
1. Initialize run (`init-run.sh <council-slug>`)
2. Write SPEC_v1.md (council structure, rules, success criteria)
3. Create `council/` directory structure
4. Write all member SPEC.md files
5. Write `council/README.md`
6. TASK_LOG entry: "Setup complete"

### Phase B: Launch
7. Update CLAUDE.md Active Tasks
8. `TeamCreate` — name the team
9. Launch all Agent Team members simultaneously (one message, multiple tool calls)
10. Launch independent reviewer if applicable (background)
11. TASK_LOG entry: "All members launched"

### Phase C: Monitor & Facilitate
12. Periodically check NOTES.md for progress
13. Facilitate cross-talk — if members aren't engaging with each other, send prompts
14. Watch for convergence AND divergence — both are valuable
15. Flag cross-cutting findings that members should address
16. TASK_LOG entry per check-in

### Phase D: Pre-Synthesis (if using independent reviewer)
17. Wait for Agent Team members to complete
18. **Do NOT read independent reviewer's findings yet**
19. Read all NOTES.md files
20. Write `PRE-SYNTHESIS.md` — convergent, divergent, and contested findings
21. TASK_LOG entry: "Pre-synthesis complete"

### Phase E: Cross-Validation (if using independent reviewer)
22. Read independent reviewer's FINDINGS.md (first time)
23. Share findings with council via SendMessage/broadcast
24. Let council settle — they validate, challenge, cross-check numbers
25. Monitor for resolution of discrepancies
26. TASK_LOG entry per round of cross-validation

### Phase F: Final Synthesis
27. Read all updated NOTES.md (including post-reveal entries)
28. Write `POST-SYNTHESIS.md` (or just `SYNTHESIS.md` if no independent reviewer)
29. Sections should include:
    - Convergent findings (what everyone agrees on)
    - Divergent findings (where perspectives differ, and why)
    - Contested findings (unresolved disagreements)
    - Cross-validated numbers (verified by multiple members)
    - Recommendations (with confidence levels)
    - Open questions
30. TASK_LOG entry: "Synthesis complete"

### Phase G: Discussion
31. Create `OPERATOR_DISCUSSION.md` — append-only
32. Present findings in accessible language
33. Discuss, debate, refine
34. TASK_LOG entry per topic

### Phase H: Wrap-Up
35. Produce deliverables based on council consensus + the user's input
36. Shutdown team
37. TASK_LOG entry: "Run complete"

---

## Cross-Talk & Cross-Validation

### Cross-Talk Rules

- Members SHOULD read each other's NOTES.md and respond
- Responses go in the responding member's own NOTES.md (not the original's)
- Format: `### Response to <role>: <topic>` with timestamp
- Disagreements are encouraged — but must include counter-evidence
- "I agree" without explanation is not useful cross-talk

### Cross-Validation ("MATHY MATH")

The core value of a council is that **everyone checks everyone's work**:
- If one member reports a number, another should independently verify it
- Discrepancies are flagged explicitly and resolved
- Final synthesis only includes numbers that have been cross-validated
- The standard is: "If N members independently computed the same number, it's solid"

This is what gives confidence in council output. A single agent's analysis is smart guesswork. A cross-validated council output is defensible.

---

## Common Anti-Patterns

### 1. Rubber-stamping
**Symptom:** All members agree on everything immediately.
**Fix:** Devil's advocate should be actively challenging. If they're not, the orchestrator should prompt them ("devil, you haven't challenged inferential's assumption about X — is it actually valid?").

### 2. Talking past each other
**Symptom:** Members produce good individual work but don't engage with each other's findings.
**Fix:** Orchestrator facilitates cross-talk explicitly: "bayesian, your prior is based on the same distribution that devil just challenged — respond."

### 3. Scope creep per member
**Symptom:** A member starts doing work that belongs to another role.
**Fix:** Keep SPEC.md focused. If a member finds something outside their lane, they should note it in NOTES.md and flag it for the relevant member, not investigate it themselves.

### 4. Premature convergence
**Symptom:** Council agrees too early, synthesis is boring.
**Fix:** More provocative devil's advocate prompting. Consider adding a second contrarian role. Or add an independent reviewer (Codex pattern) to introduce external challenge.

### 5. Too many members
**Symptom:** Cross-talk becomes unmanageable, members can't keep up with each other.
**Fix:** Cap at 6-8 members. If you need more perspectives, consider running two sequential councils (first council produces findings, second council validates).

### 6. Using individual Agent tool calls instead of Agent Teams
**Symptom:** Council members produce work but never engage with each other's NOTES.md. Cross-talk sections reference empty files or pre-written "anticipatory" responses.
**Root cause:** Individual `Agent` tool calls run in **complete isolation** — each agent gets its own subprocess with no shared filesystem access. They literally cannot read each other's NOTES.md files.
**Fix:** **ALWAYS use `TeamCreate` to create a named team, then launch members as Agent team members.** Agent Teams share the filesystem and can read/write to each other's directories in real-time. This is the entire point of cross-talk.
**Do NOT:** Launch council members as independent `Agent` tool calls, even if you launch them "simultaneously." Simultaneous ≠ collaborative. Only Agent Teams provide real-time filesystem sharing.

---

## Adapting for Different Council Types

### Planning Council (for this repo)
- Members represent different architectural concerns (infrastructure, DX, security, simplicity, etc.)
- NOTES.md contains proposals and counter-proposals, not scripts
- Cross-talk is debate-style, not number-checking
- Synthesis produces a plan with trade-offs documented

### Analysis Council (statistical, like fault-tree-council)
- Members represent different statistical/analytical lenses
- Heavy on scripts and computed outputs
- Cross-validation is literal number-checking
- Synthesis produces validated findings with confidence levels

### Review Council (code/design review)
- Members represent different quality dimensions (correctness, performance, security, maintainability)
- NOTES.md contains specific findings with file:line references
- Cross-talk is "I agree this is a problem" or "I think this is acceptable because..."
- Synthesis produces prioritized action items

---

## Quick Reference

| Element | Required? | Notes |
|---------|-----------|-------|
| SPEC_v1.md | Yes | Council structure, rules, success criteria |
| TASK_LOG.md | Yes | Updated between EVERY orchestrator step |
| council/README.md | Yes | Member roster, process overview |
| Member SPEC.md | Yes | Per-member mission and rules |
| Member NOTES.md | Yes | Append-only, timestamped |
| Devil's Advocate | Strongly recommended | For councils of 4+ members |
| Independent reviewer | Optional | Codex or different model for cross-validation |
| PRE-SYNTHESIS.md | Only with independent reviewer | Before reveal |
| POST-SYNTHESIS.md / SYNTHESIS.md | Yes | Final integrated findings |
| OPERATOR_DISCUSSION.md | Yes | Post-council discussion |
| TeamCreate | Yes | Required for Agent Team coordination |

---

*Last updated: 2026-03-05*
*Derived from: RUN-20260305-1248-fault-tree-council (artemis-east-penn-eda)*
