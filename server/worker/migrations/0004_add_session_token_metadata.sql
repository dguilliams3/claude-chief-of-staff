-- Migration 0004: Add token metadata columns to sessions table
--
-- Part of: Session Reuse + Context Visibility feature
-- SPEC: runs/CLAUDE-RUNS/RUN-20260318-1538-session-reuse-context-visibility/SPEC_v1.md
-- Drizzle schema: worker/src/db/schema.ts
--
-- Changes:
--   sessions.total_tokens: INTEGER DEFAULT 0 — current session context size (input + cache tokens)
--   sessions.context_window: INTEGER DEFAULT 0 — model's max context window (e.g. 1000000)
--   sessions.total_cost_usd: REAL DEFAULT 0 — cumulative cost across all CLI calls in this session
--   sessions.last_used_at: TEXT — ISO timestamp of most recent CLI call
--
-- Apply: cd worker && npx wrangler d1 execute <D1_DATABASE_NAME> --remote --file=./migrations/0004_add_session_token_metadata.sql

ALTER TABLE sessions ADD COLUMN total_tokens INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN context_window INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN total_cost_usd REAL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN last_used_at TEXT;
