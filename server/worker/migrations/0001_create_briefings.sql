-- Migration: 0001_create_briefings
-- Created: 2026-03-05

CREATE TABLE briefings (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  session_id TEXT NOT NULL,
  sections_json TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_briefings_type_generated ON briefings(type, generated_at DESC);
