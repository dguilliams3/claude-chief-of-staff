-- Migration 0008: Add citizen identity fields to conversations
--
-- Part of: Public repo citizen identity polish
-- Drizzle schema: server/worker/src/db/schema.ts
--
-- Changes:
--   conversations.display_name: optional user-curated citizen name
--   conversations.tagline: optional one-line byline
--   conversations.avatar: optional avatar token or URL
--
-- Apply: cd server/worker && npx wrangler d1 execute <D1_DATABASE_NAME> --remote --file=./migrations/0008_add_citizen_identity_fields.sql

ALTER TABLE conversations ADD COLUMN display_name TEXT;
ALTER TABLE conversations ADD COLUMN tagline TEXT;
ALTER TABLE conversations ADD COLUMN avatar TEXT;
