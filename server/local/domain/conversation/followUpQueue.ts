/**
 * In-process follow-up queue — per-session mutex and async job tracking.
 *
 * Mirrors triggerQueue.ts pattern: fire-and-forget with polling.
 * Prevents concurrent claude --resume calls on the same session and provides
 * status lookup for the PWA to poll until the response is ready.
 *
 * Used by: `server/local/domain/conversation/routes.ts` -- /follow-up and /follow-up/status/:jobId
 * See also: `server/local/domain/briefing/triggerQueue.ts` -- same pattern for briefing triggers
 * Do NOT: Persist jobs to disk -- in-memory is correct for a single-process server.
 *         Jobs auto-expire after RETENTION_MS to prevent memory leaks.
 */

export type FollowUpJobStatus = 'running' | 'completed' | 'failed';

export interface FollowUpJob {
  id: string;
  /** Mutex key used for deduplication — may be a synthetic value for new sessions.
   * Do NOT: Surface this in status responses — use newSessionId for the real session ID. */
  lockKey: string;
  /** The real Claude session ID — empty string until Claude responds for new sessions. */
  sessionId: string;
  status: FollowUpJobStatus;
  createdAt: string;
  completedAt?: string;
  answer?: string;
  newSessionId?: string;
  chatName?: string;
  error?: string;
  /** D1 context for push-on-completion (Worker → D1 persistence). */
  conversationId?: string;
  briefingId?: string;
  isNewSession?: boolean;
}

/** How long completed/failed jobs stay in the status map before expiry. */
const RETENTION_MS = 30 * 60 * 1000; // 30 minutes

/** Jobs by ID — for status lookup. */
const jobs = new Map<string, FollowUpJob>();

/** Currently active job ID per session — for mutex. */
const activeBySession = new Map<string, string>();

/**
 * Attempts to enqueue a follow-up. Returns null if the session already has an active job.
 *
 * @param sessionId - Claude CLI session ID (or mutex key for new sessions)
 * @returns Job if enqueued, null if session is busy (409 case)
 *
 * Upstream: `server/local/domain/conversation/routes.ts::POST /follow-up`
 * Pattern: mirrors `server/local/domain/briefing/triggerQueue.ts::enqueueJob`
 * Do NOT: Queue multiple jobs per session — Claude CLI cannot handle concurrent --resume
 */
export function enqueueFollowUp(
  lockKey: string,
  sessionId: string = '',
  context?: { conversationId?: string; briefingId?: string; isNewSession?: boolean },
): FollowUpJob | null {
  if (activeBySession.has(lockKey)) return null;

  const job: FollowUpJob = {
    id: crypto.randomUUID(),
    lockKey,
    sessionId,
    status: 'running',
    createdAt: new Date().toISOString(),
    conversationId: context?.conversationId,
    briefingId: context?.briefingId,
    isNewSession: context?.isNewSession,
  };

  jobs.set(job.id, job);
  activeBySession.set(lockKey, job.id);
  return job;
}

/**
 * Marks a follow-up job as completed with the Claude response.
 * Releases the per-session mutex so the next follow-up can proceed.
 *
 * @param jobId - Job UUID from enqueueFollowUp
 * @param result - Claude response with answer text, optional new sessionId and chatName
 *
 * Upstream: `server/local/domain/conversation/routes.ts::POST /follow-up` fire-and-forget handler
 */
export function completeFollowUp(jobId: string, result: {
  answer: string;
  sessionId?: string;
  chatName?: string;
}): void {
  const job = jobs.get(jobId);
  if (!job) return;
  job.status = 'completed';
  job.completedAt = new Date().toISOString();
  job.answer = result.answer;
  if (result.sessionId) job.newSessionId = result.sessionId;
  if (result.chatName) job.chatName = result.chatName;
  activeBySession.delete(job.lockKey);
  scheduleExpiry(jobId);
}

/**
 * Marks a follow-up job as failed with an error message.
 * Releases the per-session mutex so the user can retry.
 *
 * @param jobId - Job UUID from enqueueFollowUp
 * @param error - Human-readable error message surfaced to the PWA
 *
 * Upstream: `server/local/domain/conversation/routes.ts::POST /follow-up` fire-and-forget catch handler
 */
export function failFollowUp(jobId: string, error: string): void {
  const job = jobs.get(jobId);
  if (!job) return;
  job.status = 'failed';
  job.completedAt = new Date().toISOString();
  job.error = error;
  activeBySession.delete(job.lockKey);
  scheduleExpiry(jobId);
}

/**
 * Looks up a follow-up job by ID. Returns undefined if expired or never existed.
 *
 * @param jobId - Job UUID to look up
 * @returns FollowUpJob if found, undefined if expired (30 min TTL) or never existed
 *
 * Upstream: `server/local/domain/conversation/routes.ts::GET /follow-up/status/:jobId`
 */
export function getFollowUpJob(jobId: string): FollowUpJob | undefined {
  return jobs.get(jobId);
}

function scheduleExpiry(jobId: string): void {
  setTimeout(() => jobs.delete(jobId), RETENTION_MS);
}
