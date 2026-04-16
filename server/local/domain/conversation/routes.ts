/**
 * Follow-up routes for the conversation domain (local API side).
 *
 * Provides endpoints for enqueuing follow-up questions and polling job status:
 * - `POST /follow-up`              -- enqueues a question, returns jobId immediately (202)
 * - `GET  /follow-up/status/:jobId` -- poll follow-up job status
 *
 * Extracted from the original monolithic claude routes file during domain restructure.
 * Only the follow-up routes belong to the conversation domain; trigger/status/types
 * routes live in `server/local/domain/briefing/routes.ts`.
 *
 * Used by: `server/local/domain/conversation/index.ts` (barrel)
 * Used by: `server/local/server.ts` -- mounted at `/briefings` (legacy path kept for tunnel compat)
 * See also: `server/local/domain/conversation/followUpQueue.ts` -- async job queue
 * See also: `worker/src/domain/conversation/proxy.ts` -- Worker that proxies here
 * Coupling: `app/src/domain/conversation/types.ts` -- FollowUpResponse / FollowUpJobStatus
 * Do NOT: Change the HTTP paths -- Worker proxy hardcodes `/briefings/follow-up`
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { callClaude, buildClaudeArgs, ClaudeCliError } from '../../../../agent/claude-cli';
import { logger } from '../../../../agent/logger';
import { readLocalOverride } from '../../../../agent/local-config';
import { enqueueFollowUp, completeFollowUp, failFollowUp, getFollowUpJob } from './followUpQueue';
import { createBriefingTriggerRoutes } from '../briefing';
import { parseCliUsage } from '../../../../agent/parse-cli-usage';

/** Worker API URL for push-on-completion. If unset, push is silently skipped. */
const WORKER_URL = process.env.COS_WORKER_URL ?? '';
const COS_TOKEN = process.env.COS_TOKEN ?? '';

/**
 * Pushes a completed follow-up to the Worker for D1 persistence.
 *
 * Fire-and-forget: failure is non-fatal — the PWA's poll-based persistence
 * path is the backup. Uses the same deterministic message ID so INSERT OR IGNORE
 * deduplicates if both push and poll succeed.
 *
 * Upstream: fire-and-forget call in POST /follow-up handler below
 * Downstream: `worker/src/domain/conversation/proxy.ts::POST /internal/follow-up-complete`
 */
async function pushCompletionToWorker(job: {
  id: string;
  conversationId?: string;
  isNewSession?: boolean;
}, result: {
  answer: string;
  sessionId?: string;
  chatName?: string;
}, usage?: { totalTokens: number; contextWindow: number; costUsd: number } | null): Promise<void> {
  if (!WORKER_URL || !job.conversationId) return;

  const response = await fetch(`${WORKER_URL}/briefings/internal/follow-up-complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${COS_TOKEN}`,
    },
    body: JSON.stringify({
      jobId: job.id,
      conversationId: job.conversationId,
      answer: result.answer,
      sessionId: result.sessionId || undefined,
      chatName: result.chatName || undefined,
      isNewSession: job.isNewSession || undefined,
      usage: usage || undefined,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    logger.warn({ status: response.status, jobId: job.id }, 'Push-completion to Worker failed');
  }
}

/**
 * Default chat system prompt — tracked, read once at startup.
 * Per-instance operators can override via `local/chat-system-prompt.md`
 * (gitignored); override is re-read live on every access so edits take
 * effect without restart (fork win #2 — live getter pattern).
 */
const __currentDir = dirname(fileURLToPath(import.meta.url));
const defaultChatSystemPrompt = readFileSync(
  resolve(__currentDir, '../../../../agent/prompts/chat-system-prompt.md'),
  'utf-8',
);

/**
 * Live getter for chat system prompt. Checks `local/chat-system-prompt.md`
 * override on every call; falls back to tracked default if absent.
 * Upstream: `POST /follow-up` in this file
 * See also: `agent/local-config.ts::readLocalOverride`
 */
function getChatSystemPrompt(): string {
  return readLocalOverride('chat-system-prompt.md') ?? defaultChatSystemPrompt;
}

/** Maximum allowed length for follow-up questions (characters). */
const MAX_QUESTION_LENGTH = 10_000;

/**
 * Creates the Hono sub-app for claude CLI endpoints.
 *
 * Mounts follow-up routes directly and delegates trigger/status/types to
 * `server/local/domain/briefing/routes.ts::createBriefingTriggerRoutes`.
 *
 * @returns Hono app mounted by `server/local/server.ts` at `/briefings`
 *
 * Upstream: `server/local/server.ts` — mounts at `/briefings`
 * Downstream: `agent/claude-cli.ts::callClaude` — follow-up execution
 * Downstream: `server/local/domain/briefing/routes.ts` — trigger/status/types
 */
export function createClaudeRoutes() {
  const app = new Hono();

  /**
   * POST /follow-up — enqueues a follow-up question, returns jobId immediately.
   *
   * Fire-and-forget: callClaude runs in the background. The caller polls
   * GET /follow-up/status/:jobId to get the result when ready.
   *
   * Supports two modes:
   * - **Resume** (sessionId provided): resumes an existing Claude session
   * - **New session** (newSession:true, no sessionId): starts a fresh Claude session
   *
   * Upstream: `worker/src/domain/conversation/proxy.ts` — follow-up proxy handler
   * Downstream: `agent/claude-cli.ts` — callClaude / buildClaudeArgs
   * Downstream: `server/local/domain/conversation/followUpQueue.ts` — job lifecycle
   */
  app.post('/follow-up', async (c) => {
    const body = await c.req.json<{
      sessionId?: string;
      question: string;
      newSession?: boolean;
      conversationId?: string;
      briefingId?: string;
      isNewSession?: boolean;
    }>();
    const { question, newSession } = body;
    const sessionId = body.sessionId;

    if (typeof question !== 'string' || !question) {
      return c.json({ error: 'question required (string)' }, 400);
    }

    if (!newSession && (typeof sessionId !== 'string' || !sessionId)) {
      return c.json({ error: 'sessionId required when newSession is not true' }, 400);
    }

    if (question.length > MAX_QUESTION_LENGTH) {
      return c.json({ error: `Question too long (max ${MAX_QUESTION_LENGTH.toLocaleString()} characters)` }, 413);
    }

    // Lock key: sessionId for resumes, conversationId/briefingId for new sessions.
    // Deterministic — prevents duplicate enqueue for the same conversation.
    const lockKey = sessionId ?? body.conversationId ?? body.briefingId ?? `anon-${Date.now()}`;

    // Per-session mutex via queue: immediate 409 if session/conversation is busy
    const job = enqueueFollowUp(lockKey, sessionId ?? '', {
      conversationId: body.conversationId,
      briefingId: body.briefingId,
      isNewSession: body.isNewSession,
    });
    if (!job) {
      // Distinguish: session-level busy (resume) vs conversation-level busy (new session)
      const code = sessionId ? 'SESSION_BUSY' : 'CONVERSATION_BUSY';
      return c.json(
        {
          error: sessionId
            ? 'Another follow-up is in progress for this session'
            : 'Another follow-up is in progress for this conversation',
          code,
        },
        409,
      );
    }

    // Fire-and-forget — callClaude runs in background, result stored in job queue
    // Always use JSON output so parseCliUsage can extract token metadata from
    // both new sessions and resumed sessions. The answer is in `result` field.
    Promise.resolve().then(async () => {
      const args = buildClaudeArgs({
        system: newSession ? getChatSystemPrompt() : '',
        resumeId: newSession ? undefined : sessionId,
        outputFormat: 'json',
      });
      const result = await callClaude({ args, input: question });

      // Parse token usage from raw output (before any JSON extraction)
      const usage = parseCliUsage(result);

      // Build completion result — always JSON mode, extract from CLI envelope.
      // The CLI envelope has { result, session_id, ... }. For new sessions with a
      // system prompt, the LLM returns JSON inside `result`: { "result": "answer", "chatName": "Title" }.
      // For resumed sessions, `result` is plain text answer.
      let completionResult: { answer: string; sessionId?: string; chatName?: string };
      try {
        const parsed = JSON.parse(result) as {
          result?: string;
          session_id?: string;
        };
        let answer = parsed.result ?? result;
        let chatName: string | undefined;

        // Try to parse the inner result as JSON (new session with system prompt)
        if (parsed.result) {
          try {
            const inner = JSON.parse(parsed.result) as { result?: string; chatName?: string };
            // If it parsed as JSON, always extract the answer from inner.result
            // to prevent raw JSON leaking as the chat message
            answer = inner.result ?? parsed.result;
            if (inner.chatName) chatName = inner.chatName;
          } catch {
            // Not JSON — plain text answer from resumed session. That's fine.
          }
        }

        completionResult = {
          answer,
          sessionId: parsed.session_id ?? sessionId ?? '',
          chatName,
        };
      } catch {
        logger.warn({ outputLen: result.length }, 'JSON parse failed, returning raw');
        completionResult = { answer: result, sessionId: sessionId ?? '' };
      }

      completeFollowUp(job.id, completionResult);
      logger.info({ jobId: job.id }, 'Follow-up completed');

      // Push to Worker → D1 so the message survives even if PWA isn't polling.
      // Fire-and-forget: failure degrades to poll-based persistence (existing behavior).
      pushCompletionToWorker(job, completionResult, usage).catch(err =>
        logger.warn({ err, jobId: job.id }, 'Push-to-D1 failed (poll is backup)')
      );
    }).catch(err => {
      if (err instanceof ClaudeCliError) {
        failFollowUp(job.id, err.code === 'SESSION_EXPIRED'
          ? 'Session expired. Run a new briefing to create a fresh session.'
          : err.message);
      } else {
        const msg = err instanceof Error ? err.message : 'Claude invocation failed';
        failFollowUp(job.id, msg);
      }
      logger.error({ err, jobId: job.id }, 'Follow-up failed');
    });

    return c.json({ status: 'running', jobId: job.id }, 202);
  });

  /** GET /follow-up/status/:jobId — poll follow-up job progress */
  app.get('/follow-up/status/:jobId', (c) => {
    const job = getFollowUpJob(c.req.param('jobId'));
    if (!job) {
      return c.json({ error: 'Job not found or expired' }, 404);
    }
    return c.json(job);
  });

  // Delegate trigger/status/types to the briefing domain router
  app.route('/', createBriefingTriggerRoutes());

  return app;
}
