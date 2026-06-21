/**
 * Push domain barrel — Web Push subscription routes and send utility.
 *
 * Upstream: `server/worker/src/index.ts` — mounts push routes
 * See also: `server/worker/src/domain/briefing/routes.ts` — triggers push on sync
 */

export { push } from './routes';
export { sendPushToAll, computeSeveritySummary } from './send';
export type { PushPayload } from './send';
