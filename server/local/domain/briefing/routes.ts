/**
 * Briefing trigger routes — fire-and-forget briefing generation via TypeScript runner.
 *
 * Provides endpoints:
 * - `POST /trigger` — fires off `runBriefing()` to generate a new briefing
 * - `GET /status/:jobId` — poll trigger job status
 * - `GET /types` — returns valid briefing types from registry
 *
 * Used by: `server/local/domain/briefing/index.ts` — barrel export
 * Used by: `server/local/server.ts` — mounted at `/briefings` alongside follow-up routes
 * See also: `agent/run-briefing.ts` — the orchestrator called by trigger
 * See also: `server/local/domain/briefing/triggerQueue.ts` — job dedup and lifecycle
 * See also: `server/local/domain/conversation/routes.ts` — follow-up routes mounted on the same prefix
 * Do NOT: Add follow-up routes here — those live in `server/local/domain/conversation/routes.ts`
 */
import { Hono } from 'hono';
import { runBriefing } from '../../../../agent/run-briefing';
import { briefingTypes, validTypes } from '../../../../agent/registry';
import { logger } from '../../../../agent/logger';
import { enqueueJob, completeJob, failJob, getJob, getActiveJobId } from './triggerQueue';

/**
 * Creates the Hono sub-app for briefing trigger endpoints.
 *
 * @returns Hono app to be mounted by `server/local/server.ts` at `/briefings`
 *
 * Upstream: `server/local/server.ts` — mounts this router at `/briefings`
 * Downstream: `agent/run-briefing.ts::runBriefing` — briefing orchestration
 * Downstream: `server/local/domain/briefing/triggerQueue.ts` — job lifecycle
 */
export function createBriefingTriggerRoutes() {
  const app = new Hono();

  /**
   * POST /trigger — runs a new briefing with dedup via trigger queue.
   *
   * Fire-and-forget: `runBriefing()` runs in the background. The caller polls
   * GET /status/:jobId to check completion.
   *
   * Accepts optional `sessionId` to resume an existing Claude session instead
   * of starting fresh. When omitted, behaves as before (newSession: true).
   *
   * Upstream: `worker/src/domain/conversation/proxy.ts` — trigger proxy handler
   * Downstream: `agent/run-briefing.ts::runBriefing`
   * Downstream: `server/local/domain/briefing/triggerQueue.ts::enqueueJob`
   */
  app.post('/trigger', async (c) => {
    const { type, sessionId } = await c.req.json<{ type: string; sessionId?: string }>();

    if (!type || !validTypes.includes(type)) {
      return c.json({ error: `type must be one of: ${validTypes.join(', ')}` }, 400);
    }

    const job = enqueueJob(type);
    if (!job) {
      return c.json({ error: `A ${type} briefing is already running`, type, jobId: getActiveJobId(type) }, 409);
    }

    // Fire-and-forget with job lifecycle tracking.
    // When sessionId is provided, resume that Claude session; otherwise start fresh.
    // Wrapped in Promise.resolve().then() to catch synchronous throws from runBriefing.
    const opts = sessionId
      ? { type, resumeSessionId: sessionId }
      : { type, newSession: true };

    Promise.resolve().then(() => runBriefing(opts))
      .then(b => {
        completeJob(job.id, b.id);
        logger.info({ id: b.id, type, jobId: job.id, sessionId }, 'Trigger briefing completed');
      })
      .catch(err => {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        failJob(job.id, msg);
        logger.error({ err, type, jobId: job.id }, 'Trigger briefing failed');
      });

    return c.json({ status: 'running', type, jobId: job.id });
  });

  /** GET /status/:jobId — poll trigger job progress */
  app.get('/status/:jobId', (c) => {
    const job = getJob(c.req.param('jobId'));
    if (!job) {
      return c.json({ error: 'Job not found or expired' }, 404);
    }
    return c.json(job);
  });

  /** GET /types — valid briefing types with label and description */
  app.get('/types', (c) => {
    const types = validTypes.map((key) => ({
      key,
      label: briefingTypes[key].label,
      description: briefingTypes[key].description,
    }));
    return c.json({ types });
  });

  return app;
}
