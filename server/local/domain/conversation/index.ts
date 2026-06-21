/**
 * Barrel for the conversation domain (local API side).
 *
 * Exports all public symbols from the conversation domain:
 * - `createClaudeRoutes` -- factory returning the Hono sub-app for follow-up endpoints
 * - `followUpQueue`      -- async in-memory job queue (enqueue / complete / fail / get)
 *
 * Used by: `server/local/server.ts` -- mounts follow-up routes on the main Hono app
 * See also: `server/local/domain/conversation/routes.ts`
 * See also: `server/local/domain/conversation/followUpQueue.ts`
 */
export { createClaudeRoutes } from './routes';
export {
  enqueueFollowUp,
  completeFollowUp,
  failFollowUp,
  getFollowUpJob,
} from './followUpQueue';
export type { FollowUpJob, FollowUpJobStatus } from './followUpQueue';
