/**
 * Conversation persistence helpers -- D1 write operations for sessions,
 * conversations, and messages.
 *
 * Messages are append-only: no UPDATE, no DELETE.
 * Conversation metadata (name, session_id) CAN be updated for lazy session
 * assignment and Claude-generated naming.
 * Called by the follow-up handler in proxy.ts (writes) and by
 * briefings.ts sync handler (eager conversation creation).
 *
 * Used by: `server/worker/src/domain/conversation/proxy.ts` -- persistUserMessage, persistAssistantMessage, createBlankConversation, updateConversationName, updateConversationSessionId
 * Used by: `server/worker/src/domain/briefing/routes.ts` -- ensureConversation during sync
 * Used by: `server/worker/src/domain/conversation/routes.ts` -- createBlankConversation (POST /), updateConversationName (PATCH /:id)
 * See also: `server/worker/src/domain/conversation/routes.ts` -- read endpoints
 * See also: `server/worker/src/db/schema.ts` -- Drizzle schema for sessions, conversations, messages
 * Coupling: `app/src/domain/conversation/types.ts` -- PWA type contracts for Message shape
 * Do NOT: UPDATE or DELETE message rows -- append-only invariant
 * Do NOT: Generate timestamps client-side -- use datetime('now') in SQL or RETURNING
 * Do NOT: Return null assistantMessage when tunnel succeeded -- user must always see the answer
 */

/**
 * Normalizes SQLite datetime format to ISO 8601.
 *
 * SQLite's datetime('now') returns 'YYYY-MM-DD HH:MM:SS' (no T, no Z).
 * This converts to 'YYYY-MM-DDTHH:MM:SSZ' for the PWA API contract.
 * If already ISO 8601 (contains 'T'), returns as-is.
 *
 * Guards against null/empty input -- returns as-is if falsy.
 *
 * Coupling: Applied to all timestamp fields in conversation route responses
 * Coupling: `app/src/domain/conversation/types.ts` -- consumer expects ISO 8601 strings
 * Do NOT: Apply to briefings.generated_at -- already ISO 8601 from application code
 */
export function normalizeTimestamp(sqliteTs: string): string {
  if (!sqliteTs) return sqliteTs;
  return sqliteTs.includes('T') ? sqliteTs : sqliteTs.replace(' ', 'T') + 'Z';
}

/**
 * Persists a user message to D1 BEFORE proxying to the tunnel.
 *
 * Looks up conversation by session_id. If not found, lazily creates
 * session + conversation via INSERT OR IGNORE + re-SELECT (handles
 * pre-migration briefings and edge cases).
 *
 * Uses RETURNING clause to capture server-generated created_at timestamp.
 *
 * @param db - D1 database binding
 * @param sessionId - Claude CLI session ID
 * @param content - User's question text
 * @param briefingId - Optional briefing ID for lazy conversation creation
 * @returns Persisted message metadata (id, conversationId, createdAt)
 * @throws If conversation cannot be created or found, or D1 write fails
 *
 * Upstream: `server/worker/src/domain/conversation/proxy.ts::handleFollowUp` -- calls before tunnel proxy
 * Downstream: D1 `sessions`, `conversations`, `messages` tables
 * Coupling: Must be called BEFORE the tunnel proxy -- user message must be durable even if tunnel fails
 */
export async function persistUserMessage(
  db: D1Database,
  sessionId: string,
  content: string,
  briefingId?: string,
): Promise<{ id: string; conversationId: string; createdAt: string }> {
  // 1. Look up existing conversation
  let conv = await db.prepare(
    'SELECT id FROM conversations WHERE session_id = ?'
  ).bind(sessionId).first<{ id: string }>();

  // 2. Lazy-create if missing (pre-migration briefings, missed sync)
  if (!conv) {
    const convId = crypto.randomUUID();
    await db.batch([
      db.prepare('INSERT OR IGNORE INTO sessions (id) VALUES (?)').bind(sessionId),
      db.prepare(
        'INSERT OR IGNORE INTO conversations (id, session_id, briefing_id) VALUES (?, ?, ?)'
      ).bind(convId, sessionId, briefingId ?? null),
    ]);
    // Re-SELECT to get the ACTUAL ID (in case INSERT was ignored due to UNIQUE)
    conv = await db.prepare(
      'SELECT id FROM conversations WHERE session_id = ?'
    ).bind(sessionId).first<{ id: string }>();
    if (!conv) {
      throw new Error(`Failed to create or find conversation for session ${sessionId}`);
    }
  }

  // 3. Insert user message with RETURNING for server timestamp
  const msgId = crypto.randomUUID();
  const result = await db.prepare(
    `INSERT INTO messages (id, conversation_id, role, content)
     VALUES (?, ?, 'user', ?)
     RETURNING created_at`
  ).bind(msgId, conv.id, content).first<{ created_at: string }>();

  if (!result) {
    throw new Error(`INSERT RETURNING failed for message ${msgId} — D1 did not return created_at`);
  }

  return {
    id: msgId,
    conversationId: conv.id,
    createdAt: normalizeTimestamp(result.created_at),
  };
}

/**
 * Persists a user message directly by conversationId (new-chat flow).
 *
 * Unlike `persistUserMessage` which looks up conversation by sessionId and
 * lazily creates session/conversation rows, this function requires the
 * conversationId to already exist. Used when the Worker has already resolved
 * the conversation via `resolveFollowUpContext`.
 *
 * @param db - D1 database binding
 * @param conversationId - Conversation UUID (must already exist in D1)
 * @param content - User's question text
 * @returns Persisted message metadata (id, conversationId, createdAt)
 * @throws If D1 write fails
 *
 * Upstream: `server/worker/src/domain/conversation/proxy.ts::POST /follow-up` — new-chat flow
 * Downstream: D1 `messages` table — INSERT with RETURNING
 * Pattern: mirrors `persistUserMessage` but skips session/conversation lazy creation
 * Do NOT: Use for legacy flow (sessionId-based) — use `persistUserMessage` instead
 */
export async function persistUserMessageDirect(
  db: D1Database,
  conversationId: string,
  content: string,
): Promise<{ id: string; conversationId: string; createdAt: string }> {
  const msgId = crypto.randomUUID();
  const result = await db.prepare(
    `INSERT INTO messages (id, conversation_id, role, content)
     VALUES (?, ?, 'user', ?)
     RETURNING created_at`
  ).bind(msgId, conversationId, content).first<{ created_at: string }>();

  if (!result) {
    throw new Error(`INSERT RETURNING failed for message ${msgId}`);
  }

  return {
    id: msgId,
    conversationId,
    createdAt: normalizeTimestamp(result.created_at),
  };
}

/**
 * Persists a completed assistant reply with a deterministic message ID.
 *
 * The message ID is derived from the jobId (`${jobId}-reply`) to guarantee
 * idempotency: repeated polls for the same completed job produce the same
 * message ID, so INSERT OR IGNORE truly deduplicates.
 *
 * This fixes the UUID idempotency bug where `crypto.randomUUID()` generated
 * a new ID per poll, defeating INSERT OR IGNORE (council finding M1).
 *
 * @param db - D1 database binding
 * @param conversationId - Conversation UUID
 * @param jobId - Follow-up job ID (used to derive deterministic message ID)
 * @param content - Assistant response text
 * @returns Object with deterministic message id and server-approximated createdAt
 *
 * Upstream: `server/worker/src/domain/conversation/proxy.ts::GET /follow-up/status/:jobId` — on first completion
 * Downstream: D1 `messages` table — INSERT OR IGNORE
 * Do NOT: Generate message ID outside this function — deterministic derivation must stay here
 * Do NOT: Use `crypto.randomUUID()` — that's the bug this function fixes
 */
export async function persistCompletedAssistantReply(
  db: D1Database,
  conversationId: string,
  jobId: string,
  content: string,
): Promise<{ id: string; createdAt: string }> {
  // Deterministic ID: jobId is already a crypto.randomUUID() from enqueue time.
  // The -reply suffix prevents collision if jobId were ever used as a row ID elsewhere.
  const id = `${jobId}-reply`;
  const now = new Date().toISOString();

  await preparePersistCompletedAssistantReply(db, conversationId, jobId, content).run();

  return { id, createdAt: now };
}

/**
 * Prepares INSERT statement for completed assistant reply persistence.
 *
 * Uses deterministic message ID (`${jobId}-reply`) for idempotency.
 */
export function preparePersistCompletedAssistantReply(
  db: D1Database,
  conversationId: string,
  jobId: string,
  content: string,
): D1PreparedStatement {
  const id = `${jobId}-reply`;
  return db.prepare(
    `INSERT OR IGNORE INTO messages (id, conversation_id, role, content)
     VALUES (?, ?, 'assistant', ?)`
  ).bind(id, conversationId, content);
}

/**
 * Ensures a session and conversation exist for a given briefing.
 *
 * Called during briefing sync. Uses DB.batch() for transactional atomicity
 * and INSERT OR IGNORE for idempotency. Must be wrapped in try-catch by
 * the caller -- sync must not fail if conversation creation fails.
 *
 * @param db - D1 database binding
 * @param sessionId - Claude CLI session ID
 * @param briefingId - Briefing UUID to link
 *
 * Upstream: `server/worker/src/domain/briefing/routes.ts::POST /sync` -- try-catch wrapper
 * Downstream: D1 `sessions` + `conversations` tables -- INSERT OR IGNORE
 * Coupling: `server/worker/src/domain/conversation/persistence.ts::persistUserMessage` -- lazy creation fallback
 */
export async function ensureConversation(
  db: D1Database,
  sessionId: string,
  briefingId: string,
): Promise<void> {
  const convId = crypto.randomUUID();
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO sessions (id) VALUES (?)').bind(sessionId),
    db.prepare(
      'INSERT OR IGNORE INTO conversations (id, session_id, briefing_id) VALUES (?, ?, ?)'
    ).bind(convId, sessionId, briefingId),
  ]);
}

/**
 * Creates a blank conversation with no session yet (session assigned on first message).
 *
 * If briefingId is provided, uses INSERT OR IGNORE to respect the UNIQUE constraint
 * on briefing_id, then re-SELECTs to return the actual row (may be pre-existing).
 * If no briefingId, always creates a new standalone conversation.
 *
 * @param db - D1 database binding
 * @param briefingId - Optional briefing ID to link
 * @returns Conversation metadata { id, briefingId, sessionId, name, createdAt }
 * @throws If D1 write fails or re-SELECT returns no row
 *
 * Upstream: `server/worker/src/domain/conversation/routes.ts::POST /` -- create blank conversation
 * Upstream: `server/worker/src/domain/conversation/proxy.ts` -- may create conversation for new-chat flow
 * Downstream: D1 `conversations` table -- INSERT (OR IGNORE if briefingId)
 */
export async function createBlankConversation(
  db: D1Database,
  briefingId?: string,
): Promise<{ id: string; briefingId: string | null; sessionId: string | null; name: string | null; createdAt: string }> {
  const convId = crypto.randomUUID();

  if (briefingId) {
    // Always INSERT — briefing_id is NOT UNIQUE (multiple conversations per briefing).
    // Re-SELECT by convId (not briefing_id) to get the exact row we just created.
    await db.prepare(
      'INSERT INTO conversations (id, briefing_id) VALUES (?, ?)'
    ).bind(convId, briefingId).run();

    const row = await db.prepare(
      'SELECT id, briefing_id, session_id, name, created_at FROM conversations WHERE id = ?'
    ).bind(convId).first<{ id: string; briefing_id: string | null; session_id: string | null; name: string | null; created_at: string }>();

    if (!row) throw new Error(`Failed to create conversation ${convId} for briefing ${briefingId}`);

    return {
      id: row.id,
      briefingId: row.briefing_id,
      sessionId: row.session_id,
      name: row.name,
      createdAt: normalizeTimestamp(row.created_at),
    };
  }

  // Standalone conversation (no briefingId) -- always inserts
  const result = await db.prepare(
    'INSERT INTO conversations (id) VALUES (?) RETURNING briefing_id, session_id, name, created_at'
  ).bind(convId).first<{ briefing_id: string | null; session_id: string | null; name: string | null; created_at: string }>();

  if (!result) throw new Error(`INSERT RETURNING failed for conversation ${convId}`);

  return {
    id: convId,
    briefingId: result.briefing_id,
    sessionId: result.session_id,
    name: result.name,
    createdAt: normalizeTimestamp(result.created_at),
  };
}

/**
 * Updates a conversation's display name.
 *
 * Used for Claude-generated chat names (set on first assistant response)
 * and user-initiated renames via PATCH /conversations/:id.
 *
 * @param db - D1 database binding
 * @param conversationId - Conversation UUID
 * @param name - New display name
 *
 * Upstream: `server/worker/src/domain/conversation/routes.ts::PATCH /:id` -- user rename
 * Upstream: `server/worker/src/domain/conversation/proxy.ts` -- Claude-generated name from tunnel response
 * Downstream: D1 `conversations` table -- UPDATE name
 */
export async function updateConversationName(
  db: D1Database,
  conversationId: string,
  name: string,
): Promise<void> {
  await prepareUpdateConversationName(db, conversationId, name).run();
}

/**
 * Prepares UPDATE statement for conversation display name.
 */
export function prepareUpdateConversationName(
  db: D1Database,
  conversationId: string,
  name: string,
): D1PreparedStatement {
  return db.prepare(
    'UPDATE conversations SET name = ? WHERE id = ?'
  ).bind(name, conversationId);
}

/**
 * Assigns a Claude session ID to a conversation after first message.
 *
 * Called when the tunnel returns a new sessionId for a conversation that was
 * created blank (session_id was null). Also ensures the session row exists.
 *
 * @param db - D1 database binding
 * @param conversationId - Conversation UUID
 * @param sessionId - Claude CLI session ID to assign
 *
 * Upstream: `server/worker/src/domain/conversation/proxy.ts` -- after first message for new chat
 * Downstream: D1 `sessions` + `conversations` tables -- INSERT session, UPDATE conversation
 */
export async function updateConversationSessionId(
  db: D1Database,
  conversationId: string,
  sessionId: string,
): Promise<void> {
  await db.batch(prepareUpdateConversationSessionId(db, conversationId, sessionId));
}

/**
 * Prepares statements to assign a session ID to a conversation.
 */
export function prepareUpdateConversationSessionId(
  db: D1Database,
  conversationId: string,
  sessionId: string,
): D1PreparedStatement[] {
  return [
    db.prepare('INSERT OR IGNORE INTO sessions (id) VALUES (?)').bind(sessionId),
    db.prepare('UPDATE conversations SET session_id = ? WHERE id = ?').bind(sessionId, conversationId),
  ];
}
