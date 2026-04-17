-- Migration 0003: Add name column to conversations, make session_id nullable
--
-- Part of: New Chat Instance feature (multi-chat per briefing + standalone chats)
-- SPEC: runs/CLAUDE-RUNS/RUN-20260310-1145-new-chat-instance-brainstorm/HANDOFF.md
-- Drizzle schema: worker/src/db/schema.ts
--
-- Changes:
--   conversations.session_id: NOT NULL -> nullable (lazy session creation)
--   conversations.name: new TEXT column (Claude-generated chat title)
--   conversations.session_id UNIQUE constraint preserved (SQLite allows multiple NULLs)
--   briefing_id UNIQUE constraint removed (multiple conversations per briefing)
--
-- Apply: wrangler d1 execute <D1_DATABASE_NAME> --remote --file=./migrations/0003_...sql
--
-- SQLite does not support ALTER COLUMN, so we rebuild the table.
-- PRAGMA foreign_keys must be OFF during rebuild (messages references conversations).

PRAGMA foreign_keys = OFF;

-- Step 1: Create new table with desired schema
CREATE TABLE conversations_new (
  id TEXT PRIMARY KEY,
  session_id TEXT UNIQUE,
  briefing_id TEXT,
  name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES sessions(id),
  FOREIGN KEY (briefing_id) REFERENCES briefings(id)
);

-- Step 2: Copy existing data (name defaults to NULL)
INSERT INTO conversations_new (id, session_id, briefing_id, created_at)
SELECT id, session_id, briefing_id, created_at FROM conversations;

-- Step 3: Drop old table and rename
DROP TABLE conversations;
ALTER TABLE conversations_new RENAME TO conversations;

PRAGMA foreign_keys = ON;
