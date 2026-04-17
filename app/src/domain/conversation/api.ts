/**
 * Conversation domain API client — all HTTP functions for conversation CRUD,
 * follow-up enqueue/polling, and message retrieval.
 *
 * Handles sending follow-up questions (async polling pattern), fetching
 * conversation lists and messages, creating conversations, and updating names.
 *
 * Upstream: `app/src/store/conversationSlice.ts` — all conversation store actions
 * Downstream: Worker conversation + proxy endpoints → D1 queries + tunnel
 * See also: `app/src/domain/conversation/types.ts` — type contracts
 * See also: `app/src/domain/conversation/errors/FollowUpError.ts` — error class
 * Do NOT: Put briefing functions here — those go in `domain/briefing/api.ts`
 */

import { API_BASE, headers } from '@/lib/api';
import type {
  Message,
  ConversationListItem,
  FollowUpResponse,
  FollowUpJobStatus,
} from './types';
import { FollowUpError, ConversationError } from './errors';
import type { FollowUpErrorCode } from './errors/FollowUpError';
import type { ConversationErrorCode } from './errors/ConversationError';

/** Maps HTTP status codes to ConversationErrorCode for structured error handling. */
function codeFromStatus(status: number): ConversationErrorCode {
  if (status === 401 || status === 403) return 'UNAUTHORIZED';
  if (status === 404) return 'NOT_FOUND';
  return 'FETCH_FAILED';
}

/**
 * Sends a follow-up question — returns immediately with a jobId for polling.
 *
 * The Worker persists the user message to D1, proxies to the local API
 * which enqueues the job, and returns a 202 with the jobId.
 * Use `fetchFollowUpStatus` to poll for the response.
 *
 * @param opts - Named parameters
 * @param opts.sessionId - Claude session ID from the original briefing generation
 * @param opts.question - Free-text follow-up question from the user
 * @param opts.briefingId - Optional briefing ID for lazy conversation creation
 * @param opts.conversationId - Optional conversation ID for multi-chat support
 * @returns FollowUpResponse with jobId and persisted user message metadata
 * @throws FollowUpError with persisted/sessionExpired/sessionBusy flags
 *
 * Upstream: `app/src/store/conversationSlice.ts::sendFollowUp`
 * Downstream: Worker `POST /briefings/follow-up` → D1 user msg → tunnel → local API enqueue
 * Coupling: `app/src/domain/conversation/types.ts::FollowUpResponse` — return type
 */
export async function sendFollowUp({ sessionId, question, briefingId, conversationId }: {
  sessionId?: string;
  question: string;
  briefingId?: string;
  conversationId?: string;
}): Promise<FollowUpResponse> {
  const res = await fetch(`${API_BASE}/briefings/follow-up`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ sessionId, question, briefingId, conversationId }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: `API error: ${res.status}` }));
    const body = data as Record<string, unknown>;
    // Use structured error code from response body instead of HTTP status inference.
    // The Worker now includes a `code` field in all error responses.
    // This fixes the M2 bug where 404 ("conversation not found") was misclassified
    // as sessionExpired (which should only come from SESSION_EXPIRED code).
    const code = ((body.code as string) || 'UNKNOWN') as FollowUpErrorCode;
    throw new FollowUpError(
      (body.error as string) ?? `API error: ${res.status}`,
      code,
      (body.persisted as boolean) ?? false,
      (body.userMessage as { id: string; conversationId: string; createdAt: string } | null) ?? null,
    );
  }

  return res.json() as Promise<FollowUpResponse>;
}

/**
 * Polls follow-up job status. Returns the job state including the answer
 * when completed. Context params are forwarded so the Worker can persist
 * the assistant message to D1 on first completion.
 *
 * @param opts - Named parameters
 * @param opts.jobId - Job ID from sendFollowUp response
 * @param opts.conversationId - Conversation ID for D1 persistence context
 * @param opts.briefingId - Briefing ID for D1 persistence context
 * @param opts.isNewSession - Whether this was a new Claude session
 * @returns FollowUpJobStatus with status, answer, assistantMessage when complete
 *
 * Upstream: `app/src/store/conversationSlice.ts::sendFollowUp` polling loop
 * Downstream: Worker `GET /briefings/follow-up/status/:jobId` → tunnel → local API
 * Coupling: `app/src/domain/conversation/types.ts::FollowUpJobStatus` — return type
 */
export async function fetchFollowUpStatus({ jobId, conversationId, briefingId, isNewSession, signal }: {
  jobId: string;
  conversationId?: string | null;
  briefingId?: string | null;
  isNewSession?: boolean;
  /** AbortSignal from the polling lifecycle — cancels the request when stopPolling() is called. */
  signal?: AbortSignal;
}): Promise<FollowUpJobStatus> {
  const params = new URLSearchParams();
  if (conversationId) params.set('conversationId', conversationId);
  if (briefingId) params.set('briefingId', briefingId);
  if (isNewSession) params.set('isNewSession', 'true');
  const qs = params.toString();

  const res = await fetch(
    `${API_BASE}/briefings/follow-up/status/${encodeURIComponent(jobId)}${qs ? `?${qs}` : ''}`,
    { headers: headers(), signal },
  );

  if (!res.ok) throw new ConversationError(`Status check failed: ${res.status}`, codeFromStatus(res.status), res.status);
  return res.json() as Promise<FollowUpJobStatus>;
}

/**
 * Fetches the list of conversations with aggregates for the Chats tab.
 *
 * @returns Array of ConversationListItem objects
 * @throws On network error or non-200 response
 *
 * Upstream: `app/src/store/conversationSlice.ts::fetchConversations`
 * Downstream: Worker `GET /conversations` → D1 INNER JOIN aggregate query
 */
export async function fetchConversations(): Promise<ConversationListItem[]> {
  const res = await fetch(`${API_BASE}/conversations`, { headers: headers() });
  if (!res.ok) throw new ConversationError(`API error: ${res.status}`, codeFromStatus(res.status), res.status);
  return res.json() as Promise<ConversationListItem[]>;
}

/**
 * Fetches all messages for a conversation, ordered by timestamp ascending.
 *
 * @param opts - Named parameters
 * @param opts.conversationId - Conversation UUID
 * @returns Array of Message objects with role, content, and timestamp
 * @throws On network error or non-200 response
 *
 * Upstream: `app/src/store/conversationSlice.ts::selectConversation`, `hydrateFollowUpHistory`
 * Downstream: Worker `GET /conversations/:id/messages` → D1 query (limit 200)
 */
export async function fetchConversationMessages({ conversationId }: {
  conversationId: string;
}): Promise<Message[]> {
  const res = await fetch(
    `${API_BASE}/conversations/${encodeURIComponent(conversationId)}/messages`,
    { headers: headers() },
  );
  if (!res.ok) throw new ConversationError(`API error: ${res.status}`, codeFromStatus(res.status), res.status);
  return res.json() as Promise<Message[]>;
}

/**
 * Looks up conversations by their associated briefing ID.
 * Returns an array (empty if no conversations exist for this briefing).
 *
 * @param opts - Named parameters
 * @param opts.briefingId - Briefing UUID
 * @returns Array of ConversationListItem objects (with real aggregates from JOIN)
 * @throws On network error or non-200 response
 *
 * Upstream: `app/src/store/conversationSlice.ts::hydrateFollowUpHistory`
 * Downstream: Worker `GET /conversations/by-briefing/:briefingId` — returns aggregates via LEFT JOIN
 */
export async function fetchConversationByBriefing({ briefingId }: {
  briefingId: string;
}): Promise<ConversationListItem[]> {
  const res = await fetch(
    `${API_BASE}/conversations/by-briefing/${encodeURIComponent(briefingId)}`,
    { headers: headers() },
  );
  if (!res.ok) throw new ConversationError(`API error: ${res.status}`, codeFromStatus(res.status), res.status);
  return res.json() as Promise<ConversationListItem[]>;
}

/**
 * Creates a new conversation, optionally linked to a briefing.
 *
 * @param opts - Named parameters
 * @param opts.briefingId - Optional briefing UUID to associate with
 * @returns Newly created ConversationListItem (null sessionId, null name, 0 messageCount)
 * @throws On network error or non-200 response
 *
 * Upstream: `app/src/store/conversationSlice.ts::createConversation`
 * Downstream: Worker `POST /conversations`
 */
export async function createConversation({ briefingId }: {
  briefingId?: string;
} = {}): Promise<ConversationListItem> {
  const res = await fetch(`${API_BASE}/conversations`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ briefingId }),
  });
  if (!res.ok) throw new ConversationError(`API error: ${res.status}`, codeFromStatus(res.status), res.status);
  return res.json() as Promise<ConversationListItem>;
}

/**
 * Updates a conversation's display name.
 *
 * @param opts - Named parameters
 * @param opts.conversationId - Conversation UUID
 * @param opts.name - New display name
 * @returns Object with id and updated name
 * @throws On network error or non-200 response
 *
 * Upstream: `app/src/store/conversationSlice.ts::sendFollowUp` (chatName persistence)
 * Downstream: Worker `PATCH /conversations/:id`
 */
export async function updateConversationName({ conversationId, name }: {
  conversationId: string;
  name: string;
}): Promise<{ id: string; name: string }> {
  const res = await fetch(
    `${API_BASE}/conversations/${encodeURIComponent(conversationId)}`,
    {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({ name }),
    },
  );
  if (!res.ok) throw new ConversationError(`API error: ${res.status}`, codeFromStatus(res.status), res.status);
  return res.json() as Promise<{ id: string; name: string }>;
}
