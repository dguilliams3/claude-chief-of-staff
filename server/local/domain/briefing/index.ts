/**
 * Briefing domain barrel — re-exports trigger routes and queue for the local API.
 *
 * Used by: `server/local/server.ts` — mounts `createBriefingTriggerRoutes()` at `/briefings`
 * See also: `server/local/domain/briefing/routes.ts` — trigger route handlers
 * See also: `server/local/domain/briefing/triggerQueue.ts` — job dedup and lifecycle
 */
export { createBriefingTriggerRoutes } from './routes';
export { enqueueJob, completeJob, failJob, getJob } from './triggerQueue';
export type { Job, JobStatus } from './triggerQueue';
