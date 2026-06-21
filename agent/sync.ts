/**
 * D1 sync helper — pushes completed briefings to Cloudflare D1 via the Worker API.
 *
 * Non-fatal: failures are logged as warnings but do not abort the briefing pipeline.
 * Requires COS_TOKEN env var; skips silently if unset.
 *
 * Used by: `agent/run-briefing.ts` — called after local file write
 * See also: `worker/src/` — the Worker endpoint that receives the sync POST
 */
import { logger } from './logger';

/**
 * POSTs a briefing object to the Worker's `/briefings/sync` endpoint.
 * @param opts.briefing - Complete BriefingResult object to persist
 */
export async function syncToD1({ briefing }: { briefing: object }): Promise<void> {
  const token = process.env.COS_TOKEN;
  const workerUrl = process.env.COS_WORKER_URL;

  if (!token) {
    logger.warn('COS_TOKEN not set, skipping D1 sync');
    return;
  }

  if (!workerUrl) {
    logger.warn('COS_WORKER_URL not set, skipping D1 sync');
    return;
  }

  try {
    const res = await fetch(`${workerUrl}/briefings/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(briefing),
      signal: AbortSignal.timeout(30_000), // 30s — don't hang the briefing pipeline on a slow Worker
    });

    if (!res.ok) {
      logger.warn({ status: res.status, statusText: res.statusText }, 'D1 sync returned non-OK status');
      return;
    }

    const data = await res.json() as { status?: string; id?: string };
    logger.info({ status: data.status, id: data.id }, 'Synced to D1');
  } catch (err) {
    logger.warn({ err }, 'D1 sync failed (non-fatal)');
  }
}
