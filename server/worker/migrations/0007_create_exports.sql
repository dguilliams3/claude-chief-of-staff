-- Migration 0007: Create exports table for tracking PDF/email/etc exports
--
-- Part of: PDF Export feature
-- SPEC: runs/CLAUDE-RUNS/RUN-20260320-1329-pdf-export/SPEC_v1.md
-- Drizzle schema: worker/src/db/schema.ts
--
-- Tracks every export event: which briefing, what type, when, metadata.
-- Designed for multiple export types from day one (pdf, markdown, email).
-- R2 artifacts are stored separately — this table is the index.
--
-- Apply: cd worker && npx wrangler d1 execute <D1_DATABASE_NAME> --remote --file=./migrations/0007_create_exports.sql

CREATE TABLE exports (
  id TEXT PRIMARY KEY,
  briefing_id TEXT NOT NULL,
  export_type TEXT NOT NULL DEFAULT 'pdf',
  exported_at TEXT NOT NULL DEFAULT (datetime('now')),
  metadata_json TEXT,
  FOREIGN KEY (briefing_id) REFERENCES briefings(id)
);

CREATE INDEX idx_exports_briefing ON exports(briefing_id);
CREATE INDEX idx_exports_type ON exports(export_type, exported_at);
