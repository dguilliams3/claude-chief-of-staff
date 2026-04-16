# Upstream Sync Discipline

This fork (`claude-chief-of-staff`) was branched as a fresh `git init` from an
earlier snapshot of its canonical source (`claude-assistant`). It does NOT track
the canonical as a git remote — intentional, to keep distributable commit
history clean and avoid accidentally pulling personal literals (Dan-specific
infrastructure references, persona mentions, hardcoded feed sources).

Without an automatic pull mechanism, upstream commits can accumulate and
silently drift. This doc describes the lightweight discipline for periodic
upstream sync so the next gap analysis is cheap.

---

## The Failure Mode This Prevents

On 2026-04-16, a gap analysis between fork and canonical found **58 upstream
commits** (~4 weeks of drift) that the fork had never seen. The analysis took a
multi-agent recon run to enumerate. That entire cost is avoidable if someone
periodically (weekly or monthly) runs `scripts/list-upstream-commits.sh` and
triages the output against an UPSTREAM_SYNC.md ledger.

---

## How to Sync

### Step 1 — Install the canonical remote (one-time, local only; NOT pushed)

```bash
cd <fork-path>
git remote add canonical <path-or-url-to-claude-assistant>
git fetch canonical main
```

The remote is local-only. Do NOT push it — the fork's origin should only be
the public/shared remote.

### Step 2 — List unmerged upstream commits

```bash
./scripts/list-upstream-commits.sh
```

Prints canonical commits not ported to this fork, categorized by prefix (`fix:`,
`feat:`, `docs:`, `chore:`). Output includes the ledger status for each SHA
(ported | personal | out-of-scope | pending).

### Step 3 — Triage each pending commit

For each pending commit, open `git -C <canonical> show <sha>` and decide:

- **Port** — the change is portable. Apply semantically (paths differ: `pwa/` →
  `app/`, `worker/` → `server/worker/`, `api/` → `server/local/`). Commit with
  a clear reference like `fix: <subject> (port from canonical <sha>)`.
  Run `scripts/check-depersonalization.sh` automatically via the pre-commit
  hook — it will block commits containing Dan-specific literals.
- **Personal** — canonical-specific values (Dan's Cloudflare account, his feed
  interests, his persona wording). Add to the ledger below as "personal" so
  future reviews skip it.
- **Out-of-scope** — canonical's architecture diverged on purpose (e.g., domain
  restructure that fork already did differently). Add as "out-of-scope".

### Step 4 — Update the ledger

After each triage decision, append the SHA to the ledger below with outcome.
Keeps triage state visible and prevents re-evaluating the same SHA twice.

---

## Ledger

Newest first. Format: `<sha>` — `<subject>` — `<decision>` — optional notes.

### 2026-04-16 — Baseline gap analysis port run

The port run `RUN-20260416-1245` (see `runs/CLAUDE-RUNS/` in a local instance)
ported all must-port commits from canonical through 2026-04-14. Ledger starts
from this baseline.

**Ported:**

- `1e6c14e` — system prompt resend + visibility refresh → `ab2362d`
- `2761a07` + `a2d9044` — JSONL fallback chain → `14b3e1d`
- `a223bbc` — mandatory Sonnet subagents + live-getter upgrade → `165464b`
- `77fd71a` FIX-001 + FIX-002 → `49c3b77`
- `77fd71a` FIX-003 + `aef74a6` → `e3bdaf8` + `1efd5a6`
- `df0d190` — mobile layout → `de47c9d`

**Personal (do NOT port verbatim):**

- `d424c81` + `184574b` — R2 binding toggles (Dan's Cloudflare account state)
- Canonical `agent/feeds/sources.ts` content (LessWrong + Alignment Forum
  hardcoded) — this fork ships a suggestion catalog + `local/feeds.json`
  override pattern instead.

**Out-of-scope:**

- `c32954c` — BufferSource cast (fork already uses equivalent
  `.buffer as ArrayBuffer`)
- `009f14d` — show Community tab immediately (already handled during
  Phase C port with metadata-driven UI)
- Canonical's `pwa/`+`worker/`+`api/` topology (fork's `app/`+`server/local/`+
  `server/worker/` is an intentional distributable packaging choice)
- Canonical's in-progress domain-driven migration (parallel evolution track)

---

## Recommended Cadence

- **Weekly:** run `./scripts/list-upstream-commits.sh` and glance at new fix:
  commits — these often fix correctness bugs worth porting quickly.
- **Monthly:** triage remaining feat: / chore: / docs: commits.
- **Before any public release of the fork:** full pass through the ledger to
  ensure no critical fix went unported.
