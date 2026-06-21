-- Migration 0006: Create briefing_sections table for queryable section history
--
-- Part of: Structured Sections / Cross-Briefing Trend Detection
-- Origin: POST-SYNTHESIS.md from 11-member council — #2 priority (9/11 votes)
-- Drizzle schema: worker/src/db/schema.ts
--
-- Unflattens sections from the briefings.sections_json TEXT blob into
-- individual queryable rows. Enables cross-briefing trend detection,
-- standing issues view, and severity escalation over time.
--
-- Each row = one section from one briefing. The section_key field
-- (e.g., "DRIFT", "SPRINT_STATUS") enables grouping across briefings.
--
-- Apply: cd worker && npx wrangler d1 execute <D1_DATABASE_NAME> --remote --file=./migrations/0006_create_briefing_sections.sql

CREATE TABLE briefing_sections (
  id TEXT PRIMARY KEY,
  briefing_id TEXT NOT NULL,
  section_key TEXT NOT NULL,
  label TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (briefing_id) REFERENCES briefings(id)
);

CREATE INDEX idx_sections_key_created ON briefing_sections(section_key, created_at);
CREATE INDEX idx_sections_briefing ON briefing_sections(briefing_id);
CREATE INDEX idx_sections_severity ON briefing_sections(severity, created_at);
