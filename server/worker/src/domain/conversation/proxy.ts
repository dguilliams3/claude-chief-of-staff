/**
 * Tunnel proxy routes -- forwards trigger and follow-up requests through cloudflared
 * to the local Hono API at localhost:3141.
 *
 * The /follow-up handler persists the user message to D1, then proxies to tunnel
 * which returns a jobId immediately (202). The PWA polls /follow-up/status/:jobId
 * which proxies to tunnel and, on first completion, persists the assistant message.
 *
 * Supports both legacy flow (sessionId in body) and new-chat flow (conversationId
 * in body with lazy session assignment).
 *
 * Used by: `app/src/domain/conversation/api.ts::sendFollowUp`, `app/src/domain/conversation/api.ts::fetchFollowUpStatus`
 * See also: `server/worker/src/domain/conversation/persistence.ts` -- persistence helpers
 * See also: `server/local/domain/conversation/routes.ts` -- the local Hono server these requests are forwarded to
 * See also: `server/local/domain/conversation/followUpQueue.ts` -- async job queue on the local API
 * Coupling: `app/src/domain/conversation/types.ts::FollowUpResponse` -- POST response contract
 * Coupling: `app/src/domain/conversation/types.ts::FollowUpJobStatus` -- GET status response contract
 * Do NOT: Add persistence SQL here -- that belongs in persistence.ts
 * Do NOT: Hold open HTTP connections waiting for Claude -- use fire-and-forget + polling
 * Do NOT: Generate assistant UUID in POST handler -- it's generated in GET status on completion
 */
import { Hono } from 'hono';
import type { Env } from '../../types';
import {
  persistUserMessage,
  persistUserMessageDirect,
  preparePersistCompletedAssistantReply,
  prepareUpdateConversationName,
  prepareUpdateConversationSessionId,
} from './persistence';
import { sendPushToAll } from '../push';

/** Timeout for trigger proxy requests through the tunnel (ms). */
const TRIGGER_TIMEOUT_MS = 30_000;
/** Timeout for status polling proxy requests through the tunnel (ms). */
const STATUS_TIMEOUT_MS = 10_000;

const proxy = new Hono<{ Bindings: Env }>();

/**
 * Resolves follow-up context from the request body.
 *
 * Supports two flows:
 * 1. **New-chat flow** (conversationId provided): looks up the conversation in D1
 *    to determine if this is a first message (null session_id → newSession) or
 *    a continuation (existing session_id → resume).
 * 2. **Legacy flow** (sessionId provided): uses the session_id directly for resume.
 *
 * @returns { sessionId, conversationId, isNewSession } or null if conversation not found
 *
 * Upstream: proxy.post('/follow-up') below
 * Downstream: D1 `conversations` table -- SELECT by id
 */
async function resolveFollowUpContext(
  db: D1Database,
  body: { sessionId?: string; conversationId?: string; briefingId?: string },
): Promise<{
  sessionId: string | null;
  conversationId: string | null;
  isNewSession: boolean;
  briefingId?: string;
} | null> {
  const briefingId = body.briefingId || undefined;

  if (body.conversationId) {
    const conv = await db.prepare(
      'SELECT id, session_id, briefing_id FROM conversations WHERE id = ?'
    ).bind(body.conversationId).first<{ id: string; session_id: string | null; briefing_id: string | null }>();

    if (!conv) return null;

    return {
      sessionId: conv.session_id,
      conversationId: conv.id,
      isNewSession: !conv.session_id,
      briefingId: conv.briefing_id ?? briefingId,
    };
  }

  if (body.sessionId) {
    return {
      sessionId: body.sessionId,
      conversationId: null,
      isNewSession: false,
      briefingId,
    };
  }

  return null;
}

/**
 * POST /follow-up — persists user message, proxies to tunnel (instant 202), returns jobId.
 *
 * Flow:
 * 1. Resolve context (session_id, isNewSession) from request body
 * 2. Persist user message to D1 (synchronous, before proxy) — non-fatal on failure
 * 3. Proxy to tunnel → local API enqueues job, returns { jobId } immediately
 * 4. Return { jobId, userMessage, persisted } to PWA
 *
 * Assistant message persistence happens in the status poll handler (below),
 * not here. This handler returns in <1s.
 *
 * Upstream: `app/src/domain/conversation/api.ts::sendFollowUp`
 * Downstream: D1 messages table (user msg write), tunnel -> local API (job enqueue)
 */
proxy.post('/follow-up', async (c) => {
  const body = await c.req.json<{
    sessionId?: string;
    conversationId?: string;
    question: string;
    briefingId?: string;
  }>();
  const { question } = body;

  if (!question) {
    return c.json({ error: 'question required', code: 'INVALID_REQUEST' }, 400);
  }

  const ctx = await resolveFollowUpContext(c.env.DB, body);

  if (!ctx) {
    if (body.conversationId) {
      return c.json({ error: 'Conversation not found', code: 'NOT_FOUND' }, 404);
    }
    return c.json({ error: 'sessionId or conversationId required', code: 'INVALID_REQUEST' }, 400);
  }

  const { isNewSession } = ctx;
  const effectiveSessionId = ctx.sessionId;
  const briefingId = ctx.briefingId;

  // Step 1: Persist user message BEFORE proxying (synchronous, non-fatal)
  // User message must be durable even if the tunnel call fails.
  // Two flows: new-chat (conversationId available) or legacy (sessionId lookup).
  // Do NOT: Skip this step — user messages were the only data that survived
  // the timeout incident that motivated this async rewrite.
  let userMsg: { id: string; conversationId: string; createdAt: string } | null = null;
  try {
    if (ctx.conversationId) {
      // New-chat flow: conversationId already known
      userMsg = await persistUserMessageDirect(c.env.DB, ctx.conversationId, question);
    } else if (effectiveSessionId) {
      // Legacy flow: look up conversation by sessionId, lazy-create if needed
      userMsg = await persistUserMessage(c.env.DB, effectiveSessionId, question, briefingId);
    }
  } catch (err) {
    console.error('Failed to persist user message:', err);
  }

  // Step 2: Proxy to tunnel — returns instantly with { jobId }
  // Include conversation context so the local API can push-complete to D1
  // independently of whether the PWA is still polling.
  const tunnelUrl = c.env.TUNNEL_URL;
  const tunnelPayload: Record<string, unknown> = { question };
  if (isNewSession) {
    tunnelPayload.newSession = true; // Local API reads this for output mode
  } else if (effectiveSessionId) {
    tunnelPayload.sessionId = effectiveSessionId;
  }
  // Context for push-on-completion (local API → Worker → D1)
  if (ctx.conversationId) tunnelPayload.conversationId = ctx.conversationId;
  if (briefingId) tunnelPayload.briefingId = briefingId;
  // isNewSession is duplicated intentionally: local API reads `newSession`,
  // push-on-completion reads `isNewSession`. Same value, different consumers.
  if (isNewSession) tunnelPayload.isNewSession = true;

  let tunnelRes: Response;
  try {
    tunnelRes = await fetch(`${tunnelUrl}/briefings/follow-up`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': c.req.header('Authorization') ?? '',
      },
      body: JSON.stringify(tunnelPayload),
      signal: AbortSignal.timeout(TRIGGER_TIMEOUT_MS),
    });
  } catch {
    return c.json({
      error: 'Tunnel unreachable. Is the local API running?',
      code: 'TUNNEL_DOWN',
      persisted: userMsg !== null,
      userMessage: userMsg,
    }, 502);
  }

  if (!tunnelRes.ok) {
    const errorBody = await tunnelRes.text().catch(() => 'Unknown tunnel error');
    // Parse the local API's error to extract code if present
    let tunnelCode = 'UNKNOWN';
    try {
      const parsed = JSON.parse(errorBody);
      if (parsed.code) tunnelCode = parsed.code;
      else if (tunnelRes.status === 409) tunnelCode = 'SESSION_BUSY';
    } catch { /* errorBody wasn't JSON */ }

    // Forward all client-facing (4xx) and server (5xx) statuses — don't collapse to 502
    const status = [400, 404, 409, 413, 429, 500, 502, 503, 504].includes(tunnelRes.status)
      ? tunnelRes.status
      : 502;
    return c.json({
      error: typeof errorBody === 'string' ? errorBody : 'Unknown tunnel error',
      code: tunnelCode,
      persisted: userMsg !== null,
      userMessage: userMsg,
    }, status as 400 | 404 | 409 | 413 | 429 | 500 | 502 | 503 | 504);
  }

  const data = await tunnelRes.json<{ status: string; jobId: string }>();

  // Step 3: Return jobId + user message metadata to PWA
  return c.json({
    jobId: data.jobId,
    persisted: userMsg !== null,
    userMessage: userMsg,
    conversationId: ctx.conversationId ?? userMsg?.conversationId ?? null,
    isNewSession,
    briefingId: briefingId ?? null,
  }, 202);
});

/**
 * GET /follow-up/status/:jobId — polls follow-up job status via tunnel.
 *
 * On first completion, persists assistant message to D1 and updates
 * conversation metadata (session_id, name). Uses INSERT OR IGNORE
 * for idempotency — safe to poll multiple times after completion.
 *
 * Context params (conversationId, briefingId, isNewSession) are passed as
 * query params since Workers are stateless across requests.
 *
 * Upstream: `app/src/domain/conversation/api.ts::fetchFollowUpStatus`
 * Downstream: tunnel -> local API -> `server/local/domain/conversation/followUpQueue.ts`
 * Downstream: D1 messages table (assistant msg write on completion)
 */
proxy.get('/follow-up/status/:jobId', async (c) => {
  const jobId = c.req.param('jobId');
  const tunnelUrl = c.env.TUNNEL_URL;

  // Context from query params (set by PWA on each poll).
  // Note: conversationId is client-supplied, but the push-completion path (POST /internal/follow-up-complete)
  // already persists with the authoritative conversationId from the local API. This poll path uses
  // INSERT OR IGNORE with deterministic message IDs, so even if the client-supplied conversationId were
  // wrong, the push path's write takes precedence. Single-user system with bearer auth mitigates tampering.
  const conversationId = c.req.query('conversationId') ?? null;
  const briefingId = c.req.query('briefingId') ?? null;
  const isNewSession = c.req.query('isNewSession') === 'true';

  let tunnelRes: Response;
  try {
    tunnelRes = await fetch(`${tunnelUrl}/briefings/follow-up/status/${jobId}`, {
      headers: { 'Authorization': c.req.header('Authorization') ?? '' },
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
    });
  } catch {
    return c.json({ error: 'Tunnel unreachable' }, 502);
  }

  if (!tunnelRes.ok) {
    const status = tunnelRes.status === 404 ? 404 : 502;
    return c.json({ error: 'Job not found or expired' }, status as 404 | 502);
  }

  const job = await tunnelRes.json<{
    id: string;
    sessionId: string;
    status: 'running' | 'completed' | 'failed';
    answer?: string;
    newSessionId?: string;
    chatName?: string;
    error?: string;
  }>();

  // If not completed, return as-is (no D1 work)
  if (job.status !== 'completed') {
    return c.json(job);
  }

  // Completed — persist assistant message and update metadata.
  // Deterministic ID derived from jobId inside persistCompletedAssistantReply
  // ensures INSERT OR IGNORE truly deduplicates on repeated polls (M1 fix).
  const returnedSessionId = job.newSessionId || job.sessionId;

  // Persist assistant message with deterministic ID.
  // If this fails, the PWA still shows the message but it won't survive a page reload.
  let persistFailed = false;
  const assistantMsgId = `${job.id}-reply`;
  // ISO-8601 format — normalizeTimestamp handles consistency downstream
  const assistantCreatedAt = new Date().toISOString();
  if (conversationId) {
    try {
      const statements: D1PreparedStatement[] = [];

      if (isNewSession && returnedSessionId) {
        statements.push(
          ...prepareUpdateConversationSessionId(c.env.DB, conversationId, returnedSessionId),
        );
      }
      if (job.chatName) {
        statements.push(prepareUpdateConversationName(c.env.DB, conversationId, job.chatName));
      }

      statements.push(
        preparePersistCompletedAssistantReply(c.env.DB, conversationId, job.id, job.answer ?? ''),
      );

      await c.env.DB.batch(statements);
    } catch (err) {
      console.error('Failed to persist follow-up completion writes:', err);
      persistFailed = true;
    }
  }

  return c.json({
    ...job,
    sessionId: returnedSessionId,
    persistFailed,
    assistantMessage: {
      id: assistantMsgId,
      conversationId: conversationId ?? '',
      role: 'assistant' as const,
      content: job.answer ?? '',
      createdAt: assistantCreatedAt,
    },
    chatName: job.chatName ?? null,
  });
});

/**
 * POST /internal/follow-up-complete — receives push from local API when a follow-up
 * job completes. Persists the assistant message to D1 so it survives independently
 * of whether the PWA was polling at the time.
 *
 * Uses the same deterministic ID (`${jobId}-reply`) and INSERT OR IGNORE as the
 * poll-based path, so concurrent push + poll is safe (exactly-once persistence).
 *
 * Upstream: `server/local/domain/conversation/routes.ts` — local API pushes on job completion
 * Downstream: D1 messages, conversations, sessions tables via persistence.ts prepared statements
 * Downstream: `server/worker/src/domain/push/send.ts::sendPushToAll` — sends follow-up push notification
 * Do NOT: Remove the poll-based persistence in GET /follow-up/status/:jobId — it's
 *         the fast-path for live users; this endpoint is the safety net.
 */
proxy.post('/internal/follow-up-complete', async (c) => {
  const body = await c.req.json<{
    jobId: string;
    conversationId: string;
    answer: string;
    sessionId?: string;
    chatName?: string;
    isNewSession?: boolean;
    usage?: { totalTokens: number; contextWindow: number; costUsd: number };
  }>();

  const { jobId, conversationId, answer } = body;
  if (!jobId || !conversationId || typeof answer !== 'string') {
    return c.json({ error: 'jobId, conversationId, and answer required' }, 400);
  }

  try {
    const statements: D1PreparedStatement[] = [];

    if (body.isNewSession && body.sessionId) {
      statements.push(
        ...prepareUpdateConversationSessionId(c.env.DB, conversationId, body.sessionId),
      );
    }
    if (body.chatName) {
      statements.push(prepareUpdateConversationName(c.env.DB, conversationId, body.chatName));
    }

    statements.push(
      preparePersistCompletedAssistantReply(c.env.DB, conversationId, jobId, answer),
    );

    // Update session token metadata if usage data is present.
    // total_tokens and context_window are absolute (idempotent). total_cost_usd
    // uses MAX to avoid double-counting when both push + poll fire for the same job.
    const effectiveSessionId = body.sessionId || null;
    if (body.usage && effectiveSessionId) {
      statements.push(
        c.env.DB.prepare(`
          UPDATE sessions
          SET total_tokens = ?, context_window = ?,
              total_cost_usd = MAX(total_cost_usd, ?),
              last_used_at = datetime('now')
          WHERE id = ?
        `).bind(
          body.usage.totalTokens,
          body.usage.contextWindow,
          body.usage.costUsd,
          effectiveSessionId,
        ),
      );
    }

    await c.env.DB.batch(statements);

    // Push notification for follow-up response (non-fatal, fire-and-forget).
    // The SW suppresses the notification if the PWA is visible on that device.
    if (c.env.VAPID_PUBLIC_KEY && c.env.VAPID_PRIVATE_KEY && c.env.VAPID_SUBJECT) {
      const snippet = answer.length > 80 ? answer.slice(0, 80) + '…' : answer;
      const pushPromise = sendPushToAll(c.env.DB, {
        title: 'Response ready',
        body: snippet,
        url: '/',
        icon: '/icon-192.png',
      }, {
        publicKey: c.env.VAPID_PUBLIC_KEY,
        privateKey: c.env.VAPID_PRIVATE_KEY,
        subject: c.env.VAPID_SUBJECT,
      }).catch(err => console.error('Follow-up push failed:', err));

      if (c.executionCtx?.waitUntil) {
        c.executionCtx.waitUntil(pushPromise);
      }
    }

    return c.json({ ok: true });
  } catch (err) {
    console.error('Push-completion D1 write failed:', err);
    return c.json({ error: 'D1 write failed' }, 500);
  }
});

/**
 * Proxies a briefing trigger request to the local API via the cloudflared tunnel.
 */
proxy.post('/trigger', async (c) => {
  const body = await c.req.json();
  const tunnelUrl = c.env.TUNNEL_URL;

  try {
    const res = await fetch(`${tunnelUrl}/briefings/trigger`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': c.req.header('Authorization') ?? '',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TRIGGER_TIMEOUT_MS),
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => 'Trigger failed');
      const status = [400, 409, 500].includes(res.status) ? res.status : 502;
      return c.json({ error: errorBody }, status as 400 | 409 | 500 | 502);
    }

    const data = await res.json();
    return c.json(data);
  } catch {
    return c.json({ error: 'Tunnel unreachable. Is the local API running?' }, 502);
  }
});

/** GET /status/:jobId — proxies trigger status polling to the local API */
proxy.get('/status/:jobId', async (c) => {
  const jobId = c.req.param('jobId');
  const tunnelUrl = c.env.TUNNEL_URL;

  try {
    const res = await fetch(`${tunnelUrl}/briefings/status/${jobId}`, {
      headers: { 'Authorization': c.req.header('Authorization') ?? '' },
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
    });
    const data = await res.json();
    return c.json(data, res.status as 200 | 404);
  } catch {
    return c.json({ error: 'Tunnel unreachable' }, 502);
  }
});

export { proxy };
