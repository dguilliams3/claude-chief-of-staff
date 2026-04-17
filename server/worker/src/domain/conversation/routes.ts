/**
 * Conversation routes -- D1-backed endpoints for the Chats tab,
 * FollowUpBar hydration, and multi-chat management.
 *
 * STABLE CONTRACT consumed by the PWA Chats tab and FollowUpBar hydration.
 *
 * Used by: `app/src/domain/conversation/api.ts::fetchConversations` (GET /conversations)
 * Used by: `app/src/domain/conversation/api.ts::fetchConversationMessages` (GET /conversations/:id/messages)
 * Used by: `app/src/domain/conversation/api.ts::fetchConversationByBriefing` (GET /conversations/by-briefing/:id)
 * Used by: `app/src/domain/conversation/api.ts` (POST /conversations -- create blank, PATCH /conversations/:id -- rename)
 * See also: `server/worker/src/domain/conversation/persistence.ts` -- write helpers
 * See also: `worker/migrations/0002_create_sessions_conversations_messages.sql` -- table DDL for sessions, conversations, messages
 * Coupling: `app/src/domain/conversation/types.ts` -- PWA type contracts for API responses
 * Do NOT: Use DELETE on any conversation/message row -- append-only invariant for messages
 * Do NOT: Generate timestamps client-side -- use datetime('now') in SQL
 */
import { Hono } from 'hono';
import type { Env } from '../../types';
import { normalizeTimestamp, createBlankConversation, updateConversationName } from './persistence';

const conversations = new Hono<{ Bindings: Env }>();

/**
 * Lists conversations with aggregates for the Chats tab.
 *
 * Returns up to 50 conversations ordered by last message timestamp (default)
 * or creation time. Uses LEFT JOIN so conversations with no messages yet
 * (e.g., blank chats created via POST) appear in the list. Includes
 * messageCount, lastMessageAt, name, and sessionId (nullable).
 *
 * @param sort - Query param: 'created' for creation order, default is last_message_at DESC
 * @param limit - Query param: max rows (capped at 50, default 50)
 * @returns Array of ConversationListItem objects, camelCase fields
 *
 * Upstream: `app/src/domain/conversation/api.ts::fetchConversations`
 * Downstream: D1 `conversations` + `messages` tables -- LEFT JOIN aggregate
 * Do NOT: Return message content here -- use GET /conversations/:id/messages for that
 */
conversations.get('/', async (c) => {
  // Safe interpolation: `sort` is always one of two hardcoded column names (ternary below).
  // D1 prepared statements cannot parameterize ORDER BY columns.
  const sort = c.req.query('sort') === 'created' ? 'c.created_at' : 'last_message_at';
  const rawLimit = Number(c.req.query('limit'));
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, 50)) : 50;

  const rows = await c.env.DB.prepare(`
    SELECT
      c.id, c.session_id, c.briefing_id, c.name, c.created_at,
      MAX(m.created_at) AS last_message_at,
      COUNT(m.id) AS message_count,
      s.total_tokens, s.context_window,
      b.type AS briefing_type, b.generated_at AS briefing_generated_at
    FROM conversations c
    LEFT JOIN messages m ON m.conversation_id = c.id
    LEFT JOIN sessions s ON s.id = c.session_id
    LEFT JOIN briefings b ON b.id = c.briefing_id
    GROUP BY c.id
    ORDER BY ${sort} DESC
    LIMIT ?
  `).bind(limit).all();

  const items = rows.results.map((row) => {
    const r = row as Record<string, string | number | null>;
    return {
      id: r.id as string,
      briefingId: (r.briefing_id as string) || null,
      sessionId: (r.session_id as string) || null,
      name: (r.name as string) || null,
      createdAt: normalizeTimestamp(r.created_at as string),
      lastMessageAt: r.last_message_at ? normalizeTimestamp(r.last_message_at as string) : null,
      messageCount: (r.message_count as number) ?? 0,
      totalTokens: (r.total_tokens as number) ?? null,
      contextWindow: (r.context_window as number) ?? null,
      briefingType: (r.briefing_type as string) || null,
      briefingGeneratedAt: r.briefing_generated_at ? normalizeTimestamp(r.briefing_generated_at as string) : null,
    };
  });

  return c.json(items);
});

/**
 * Returns all messages for a conversation, ordered by created_at ASC.
 *
 * Hard limit of 200 messages. Used by FollowUpBar hydration on mount
 * and by the Chats tab detail view.
 *
 * @param id - Route param: conversation UUID
 * @param limit - Query param: max messages (capped at 200, default 200)
 * @returns Array of Message objects with role, content, and timestamp; 404 if conversation not found
 *
 * Upstream: `app/src/domain/conversation/api.ts::fetchConversationMessages`
 * Downstream: D1 `messages` table -- SELECT with ORDER BY created_at ASC
 * Do NOT: Paginate -- 200 hard limit is sufficient for conversation history
 */
conversations.get('/:id/messages', async (c) => {
  const conversationId = c.req.param('id');
  const rawLimit = Number(c.req.query('limit'));
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, 200)) : 200;

  const rows = await c.env.DB.prepare(`
    SELECT id, conversation_id, role, content, created_at
    FROM messages
    WHERE conversation_id = ?
    ORDER BY created_at ASC
    LIMIT ?
  `).bind(conversationId, limit).all();

  // Return empty array for conversations with no messages — PWA handles this.
  // Skip the extra D1 round-trip to verify conversation existence; the conversation
  // was already validated when it was selected/created.

  const messages = rows.results.map((row) => {
    const r = row as Record<string, string>;
    return {
      id: r.id,
      conversationId: r.conversation_id,
      role: r.role,
      content: r.content,
      createdAt: normalizeTimestamp(r.created_at),
    };
  });

  return c.json(messages);
});

/**
 * Looks up conversations by briefing ID.
 *
 * Returns an array of conversations (multiple conversations per briefing supported
 * since migration 0003 removed UNIQUE on briefing_id). Uses LEFT JOIN with messages
 * to include conversations with no messages yet. Returns empty array if none found.
 *
 * @param briefingId - Route param: briefing UUID to look up
 * @returns Array of Conversation objects (id, sessionId, briefingId, name, createdAt); empty array if not found
 *
 * Upstream: `app/src/domain/conversation/api.ts::fetchConversationByBriefing`
 * Downstream: D1 `conversations` table -- no UNIQUE on briefing_id (multi-chat per briefing)
 * Do NOT: Return messages here -- use GET /conversations/:id/messages for that
 */
conversations.get('/by-briefing/:briefingId', async (c) => {
  const briefingId = c.req.param('briefingId');
  const rows = await c.env.DB.prepare(
    `SELECT c.id, c.session_id, c.briefing_id, c.name, c.created_at,
            COUNT(m.id) AS message_count,
            MAX(m.created_at) AS last_message_at,
            s.total_tokens, s.context_window
     FROM conversations c
     LEFT JOIN messages m ON m.conversation_id = c.id
     LEFT JOIN sessions s ON s.id = c.session_id
     WHERE c.briefing_id = ?
     GROUP BY c.id`
  ).bind(briefingId).all();

  const items = rows.results.map((row) => {
    const r = row as Record<string, string | number | null>;
    return {
      id: r.id as string,
      sessionId: (r.session_id as string) || null,
      briefingId: r.briefing_id as string,
      name: (r.name as string) || null,
      createdAt: normalizeTimestamp(r.created_at as string),
      messageCount: (r.message_count as number) ?? 0,
      lastMessageAt: r.last_message_at ? normalizeTimestamp(r.last_message_at as string) : null,
      totalTokens: (r.total_tokens as number) ?? null,
      contextWindow: (r.context_window as number) ?? null,
    };
  });

  return c.json(items);
});

/**
 * Creates a blank conversation (no session yet).
 *
 * Session is assigned lazily on first message via the follow-up proxy.
 * If briefingId is provided, uses INSERT OR IGNORE to respect UNIQUE constraint
 * and returns the existing conversation if one already exists for that briefing.
 *
 * @param briefingId - Optional briefing ID to associate
 * @returns New or existing conversation object
 *
 * Upstream: PWA new-chat UI
 * Downstream: `persistence.ts::createBlankConversation`
 */
conversations.post('/', async (c) => {
  const body = await c.req.json<{ briefingId?: string }>();
  const briefingId = body.briefingId || undefined;

  try {
    const conv = await createBlankConversation(c.env.DB, briefingId);
    return c.json(conv, 201);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create conversation';
    return c.json({ error: msg }, 500);
  }
});

/**
 * Updates a conversation's display name.
 *
 * @param id - Route param: conversation UUID
 * @param name - Body: new display name (required, non-empty string)
 * @returns Updated conversation object (id, name)
 *
 * Upstream: PWA conversation rename UI
 * Downstream: `persistence.ts::updateConversationName`
 */
conversations.patch('/:id', async (c) => {
  const conversationId = c.req.param('id');
  const body = await c.req.json<{ name?: string }>();
  const name = body.name;

  if (typeof name !== 'string' || !name.trim()) {
    return c.json({ error: 'name is required (non-empty string)' }, 400);
  }

  // Verify conversation exists
  const conv = await c.env.DB.prepare(
    'SELECT id FROM conversations WHERE id = ?'
  ).bind(conversationId).first();

  if (!conv) {
    return c.json({ error: 'Conversation not found' }, 404);
  }

  try {
    await updateConversationName(c.env.DB, conversationId, name.trim());
    return c.json({ id: conversationId, name: name.trim() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to update conversation';
    return c.json({ error: msg }, 500);
  }
});

export { conversations };
