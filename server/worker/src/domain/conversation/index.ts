/**
 * Barrel for the conversation domain (Worker-side).
 *
 * Exports all public symbols from the conversation domain:
 * - `routes`      -- Hono sub-app for CRUD endpoints (GET /conversations, etc.)
 * - `proxy`       -- Hono sub-app for tunnel proxy routes (/follow-up, /trigger)
 * - `persistence` -- D1 write helpers (persistUserMessage, ensureConversation, …)
 *
 * Used by: `server/worker/src/index.ts` -- mounts routes and proxy on the main Hono app
 * See also: `server/worker/src/domain/conversation/routes.ts`
 * See also: `server/worker/src/domain/conversation/proxy.ts`
 * See also: `server/worker/src/domain/conversation/persistence.ts`
 */
export { conversations } from './routes';
export { proxy } from './proxy';
export * from './persistence';
