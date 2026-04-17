/**
 * Drizzle ORM schema for the Cloudflare D1 database.
 *
 * Defines all tables used for append-only storage of briefings, sessions,
 * conversations, messages, push subscriptions, briefing sections, and exports.
 * Columns use snake_case in D1; the Drizzle schema maps to camelCase in TypeScript.
 *
 * Used by: `server/worker/src/domain/briefing/routes.ts` (raw D1 queries, not Drizzle query builder)
 * Coupling: `server/worker/src/domain/briefing/routes.ts` — column names in raw SQL must match this schema
 * Coupling: `app/src/domain/briefing/types.ts::Briefing` — parsed output shape must match PWA expectations
 * See also: `CLAUDE.md` — append-only storage rule, no deletes
 */
import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

/**
 * The `briefings` table in Cloudflare D1.
 *
 * Each row is an immutable briefing blob. `sections_json` and `metadata_json` store
 * stringified JSON (D1 has no native JSON column type). The composite index on
 * `(type, generated_at)` supports the "latest per type" query in the `/latest` route.
 *
 * Coupling: `server/worker/src/domain/briefing/routes.ts` — raw SQL bind order must match column order here
 * See also: `app/src/domain/briefing/api.ts::fetchBriefings` — consumer of the parsed output
 */
export const briefings = sqliteTable('briefings', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  generatedAt: text('generated_at').notNull(),
  sessionId: text('session_id').notNull(),
  sectionsJson: text('sections_json').notNull(),
  metadataJson: text('metadata_json').notNull(),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_briefings_type_generated').on(table.type, table.generatedAt),
]);

/**
 * The `sessions` table -- represents Claude CLI session instances.
 *
 * Each row is a unique Claude CLI session. The `id` column IS the Claude
 * session ID string (not a UUID). Created during briefing sync or first
 * follow-up for a session.
 *
 * Coupling: `server/worker/src/domain/conversation/persistence.ts` -- INSERT OR IGNORE on sync/lazy creation
 * Coupling: `server/worker/src/domain/briefing/routes.ts` -- sync route creates session row
 * See also: `server/worker/src/db/schema.ts::conversations` -- FK from conversations.session_id
 */
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  totalTokens: integer('total_tokens').default(0),
  contextWindow: integer('context_window').default(0),
  totalCostUsd: real('total_cost_usd').default(0),
  lastUsedAt: text('last_used_at'),
});

/**
 * The `conversations` table -- links a session to an optional briefing with chat history.
 *
 * session_id is nullable for lazy session creation (conversation row created
 * before first message; Claude session assigned on first send). UNIQUE
 * constraint allows multiple NULLs (SQLite standard). briefing_id is nullable
 * for standalone chats. name is Claude-generated on first response.
 *
 * Coupling: `server/worker/src/domain/conversation/persistence.ts` -- all write operations
 * Coupling: `server/worker/src/domain/conversation/routes.ts` -- all read operations
 * Coupling: `app/src/domain/conversation/types.ts::ConversationListItem` -- API response shape
 * See also: `server/worker/src/db/schema.ts::messages` -- child table with FK
 * See also: `server/worker/src/db/schema.ts::sessions` -- parent table
 */
export const conversationsTable = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').unique(),
  briefingId: text('briefing_id'),
  name: text('name'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

/**
 * The `briefing_sections` table — individual queryable sections from briefings.
 *
 * Unflattened from briefings.sections_json. Enables cross-briefing trend detection,
 * standing issues view, and severity escalation over time. Each row = one section
 * from one briefing.
 *
 * Coupling: `server/worker/src/domain/briefing/routes.ts` — written during sync, queried by trend endpoint
 * See also: `server/worker/src/db/schema.ts::briefings` — parent table
 * See also: `app/src/domain/briefing/types.ts::BriefingSection` — section shape
 */
export const briefingSections = sqliteTable('briefing_sections', {
  id: text('id').primaryKey(),
  briefingId: text('briefing_id').notNull(),
  sectionKey: text('section_key').notNull(),
  label: text('label').notNull(),
  severity: text('severity').notNull().default('info'),
  content: text('content').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_sections_key_created').on(table.sectionKey, table.createdAt),
  index('idx_sections_briefing').on(table.briefingId),
  index('idx_sections_severity').on(table.severity, table.createdAt),
]);

/**
 * The `push_subscriptions` table — browser push subscription credentials.
 *
 * Each row represents one browser/device that has granted notification permission.
 * Endpoint is the browser's push service URL; p256dh and auth are the encryption
 * keys needed to send encrypted push messages via the Web Push API.
 *
 * Coupling: `server/worker/src/domain/push/routes.ts` — subscribe/unsubscribe endpoints
 * Coupling: `server/worker/src/domain/push/send.ts` — reads subscriptions to send pushes
 * See also: `server/worker/src/domain/briefing/routes.ts` — triggers push after sync
 */
export const pushSubscriptions = sqliteTable('push_subscriptions', {
  id: text('id').primaryKey(),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

/**
 * The `messages` table -- individual chat messages within a conversation.
 *
 * Append-only. Role is constrained to 'user' | 'assistant' via CHECK.
 * Index on (conversation_id, created_at) for ordered retrieval.
 * Hard query limit of 200 messages per conversation.
 *
 * Coupling: `server/worker/src/domain/conversation/persistence.ts` -- INSERT operations
 * Coupling: `server/worker/src/domain/conversation/routes.ts` -- SELECT operations
 * Coupling: `app/src/domain/conversation/types.ts::Message` -- API response shape
 * See also: `server/worker/src/db/schema.ts::conversations` -- parent table
 * Do NOT: UPDATE or DELETE rows -- append-only invariant
 */
export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_messages_conversation_created').on(table.conversationId, table.createdAt),
]);

/**
 * The `exports` table — tracks briefing export events (PDF, markdown, email).
 *
 * Each row records one export action: which briefing, what format, when.
 * The actual exported artifact (e.g., PDF blob) is stored in R2, keyed by export ID.
 * Designed for multiple export types from day one.
 *
 * Coupling: `server/worker/src/domain/export/routes.ts` — POST /exports endpoint
 * See also: `server/worker/wrangler.toml` — EXPORTS_BUCKET R2 binding
 * See also: `app/src/lib/export/` — client-side PDF generation
 */
export const exports = sqliteTable('exports', {
  id: text('id').primaryKey(),
  briefingId: text('briefing_id').notNull(),
  exportType: text('export_type').notNull().default('pdf'),
  exportedAt: text('exported_at').notNull().default(sql`(datetime('now'))`),
  metadataJson: text('metadata_json'),
}, (table) => [
  index('idx_exports_briefing').on(table.briefingId),
  index('idx_exports_type').on(table.exportType, table.exportedAt),
]);
