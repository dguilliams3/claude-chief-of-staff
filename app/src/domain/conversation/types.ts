/**
 * TypeScript type definitions for conversation and message data structures.
 *
 * STABLE CONTRACT -- these types define the shape of data stored in D1
 * and returned by the Worker conversation API endpoints. Changes here
 * must be mirrored in the Worker route handlers and D1 schema.
 *
 * Coupling: `worker/src/routes/conversations.ts` -- Worker returns these shapes
 * Coupling: `worker/src/routes/conversation-persistence.ts` -- Worker writes these shapes
 * Coupling: `app/src/store/index.ts` -- store holds conversation state
 * See also: `app/src/domain/conversation/api.ts` -- HTTP client that fetches these types
 * See also: `app/src/domain/briefing/types.ts` -- sibling type file for briefing data
 */

/**
 * Message role -- string literal union, not enum.
 * Matches D1 CHECK(role IN ('user','assistant')) constraint.
 *
 * Coupling: `worker/src/db/schema.ts` -- CHECK constraint
 * Coupling: `worker/src/routes/conversation-persistence.ts` -- inserts with these values
 */
export type MessageRole = 'user' | 'assistant';

/**
 * A single message in a conversation.
 * Matches the D1 `messages` table row shape after camelCase mapping.
 *
 * STABLE CONTRACT -- changes must be mirrored in Worker route handlers.
 *
 * Coupling: `worker/src/routes/conversations.ts` -- produces this shape
 * Coupling: `app/src/store/index.ts` -- store holds Message[]
 */
export interface Message {
  /** UUID primary key */
  id: string;
  /** FK to conversations.id */
  conversationId: string;
  /** 'user' or 'assistant' */
  role: MessageRole;
  /** Message body text */
  content: string;
  /** ISO 8601 timestamp, server-generated */
  createdAt: string;
}

/**
 * Lightweight conversation list item for the Chats tab.
 * Returned by GET /conversations. Includes computed aggregates.
 * lastMessageAt is non-nullable because INNER JOIN guarantees messages exist.
 *
 * STABLE CONTRACT -- changes must be mirrored in Worker route handlers.
 *
 * Coupling: `worker/src/routes/conversations.ts` -- SQL projection produces this
 * Coupling: `app/src/views/ChatsView/ChatsView.tsx` -- renders list of these
 */
export interface ConversationListItem {
  /** UUID primary key */
  id: string;
  /** FK to briefings.id, nullable for standalone chats */
  briefingId: string | null;
  /** Claude CLI session ID — null until first message (lazy session creation) */
  sessionId: string | null;
  /** Human-readable chat name, set by Claude on first response */
  name: string | null;
  /** ISO 8601 conversation creation timestamp */
  createdAt: string;
  /** ISO 8601 timestamp of the most recent message, or null for conversations with no messages */
  lastMessageAt: string | null;
  /** Total messages in this conversation (computed) */
  messageCount: number;
  /** Total tokens used in the linked session (null if no session or session predates token tracking) */
  totalTokens?: number | null;
  /** Context window size for the linked session (null if no session or session predates token tracking) */
  contextWindow?: number | null;
  /** Briefing type (e.g., 'work', 'news') — from JOIN, null for standalone chats */
  briefingType?: string | null;
  /** Briefing generation timestamp — from JOIN, null for standalone chats */
  briefingGeneratedAt?: string | null;
}

/**
 * Full conversation row. Used for by-briefing lookup (FollowUpBar hydration).
 * Maps directly to the D1 `conversations` table (no aggregates).
 */
export interface Conversation {
  /** UUID primary key */
  id: string;
  /** Claude CLI session ID — null until first message (lazy session creation) */
  sessionId: string | null;
  /** Human-readable chat name, set by Claude on first response */
  name: string | null;
  /** FK to briefings.id, nullable */
  briefingId: string | null;
  /** ISO 8601 conversation creation timestamp */
  createdAt: string;
}

/**
 * Follow-up enqueue response from POST /briefings/follow-up (202).
 *
 * The Worker persists the user message and returns a jobId for polling.
 * The assistant response arrives later via GET /follow-up/status/:jobId.
 *
 * Coupling: `worker/src/routes/proxy.ts` — produces this shape
 * Coupling: `app/src/domain/conversation/api.ts::sendFollowUp` — returns this type
 */
export interface FollowUpResponse {
  /** Job ID for polling status */
  jobId: string;
  /** Whether the user message was persisted to D1 */
  persisted: boolean;
  /** D1 metadata for the persisted user message (null if D1 was down) */
  userMessage: { id: string; conversationId: string; createdAt: string } | null;
  /** Conversation ID (resolved or created) */
  conversationId: string | null;
  /** Whether this follow-up started a new Claude session */
  isNewSession: boolean;
  /** Briefing ID if linked */
  briefingId: string | null;
}

/**
 * Follow-up job status from GET /follow-up/status/:jobId.
 *
 * When status is 'completed', includes the assistant's response and
 * metadata for D1 reconciliation.
 *
 * Coupling: `worker/src/routes/proxy.ts` — GET /follow-up/status/:jobId
 * Coupling: `app/src/domain/conversation/api.ts::fetchFollowUpStatus` — returns this type
 */
export interface FollowUpJobStatus {
  /** Job ID */
  id: string;
  /** Claude session ID */
  sessionId: string;
  /** Job status */
  status: 'running' | 'completed' | 'failed';
  /** The assistant's answer (only when completed) */
  answer?: string;
  /** Full assistant message with D1 metadata (only when completed) */
  assistantMessage?: Message;
  /** Claude-generated chat title (only on first message) */
  chatName?: string | null;
  /** Error message (only when failed) */
  error?: string;
}
