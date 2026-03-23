-- Migration 0005: Create push_subscriptions table for Web Push notifications
--
-- Part of: Push Notifications with Severity Summary feature
-- SPEC: runs/CLAUDE-RUNS/RUN-20260318-2237-push-notifications/SPEC_v1.md
-- Drizzle schema: worker/src/db/schema.ts
--
-- Stores browser push subscription credentials (Web Push API).
-- Each row = one browser that has granted notification permission.
-- Endpoint is the browser's push service URL; p256dh and auth are
-- the encryption keys needed to send encrypted push messages.
--
-- Apply: cd worker && npx wrangler d1 execute cos-briefings --remote --file=./migrations/0005_create_push_subscriptions.sql

CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
