-- Migration 0002: Create sessions, conversations, and messages tables
--
-- Part of: Follow-up conversation persistence feature
-- Drizzle schema: server/worker/src/db/schema.ts (documentation only -- this file is DDL source of truth)
--
-- Tables created:
--   sessions      -- Claude CLI session instances (PK = session ID string)
--   conversations -- Links session to optional briefing (1:1 with session)
--   messages      -- Individual chat messages (append-only, role CHECK constraint)
--
-- Backfill: Existing briefings -> sessions + conversations rows
-- Apply: wrangler d1 migrations apply <D1_DATABASE_NAME>
--
-- APPEND-ONLY: These tables never receive UPDATE or DELETE operations.
--
-- WARNING: briefings sync route uses INSERT OR REPLACE (DELETE+INSERT).
--          If PRAGMA foreign_keys is ever enabled, this will FAIL with a FK
--          constraint violation (conversations.briefing_id references briefings.id).
--          Fix: change briefings.ts to INSERT OR IGNORE + UPDATE.
--
-- Backfill IDs use 'conv-{briefingId}' prefix for debuggability.
-- Pre-migration check (run manually before applying):
--   SELECT session_id, COUNT(*) c FROM briefings GROUP BY session_id HAVING c > 1;
--   If results exist, multiple briefings share a session_id. Only one will get a
--   conversation row (UNIQUE on session_id). Lazy creation handles the rest at runtime.

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  briefing_id TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES sessions(id),
  FOREIGN KEY (briefing_id) REFERENCES briefings(id)
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user','assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE INDEX idx_messages_conversation_created ON messages(conversation_id, created_at);

-- Backfill existing briefings into sessions
INSERT OR IGNORE INTO sessions (id, created_at)
SELECT DISTINCT session_id, MIN(created_at) FROM briefings
WHERE session_id IS NOT NULL AND session_id != ''
GROUP BY session_id;

-- Backfill existing briefings into conversations
INSERT OR IGNORE INTO conversations (id, session_id, briefing_id, created_at)
SELECT 'conv-' || id, session_id, id, created_at FROM briefings
WHERE session_id IS NOT NULL AND session_id != '';

-- Post-migration verification (run manually after applying):
-- SELECT COUNT(*) AS session_count FROM sessions;
-- SELECT COUNT(*) AS conversation_count FROM conversations;
-- SELECT COUNT(*) AS briefing_with_session FROM briefings WHERE session_id IS NOT NULL AND session_id != '';
-- session_count should equal number of distinct session_ids in briefings.
-- conversation_count should equal briefing_with_session (one conv per briefing, modulo UNIQUE conflicts).
