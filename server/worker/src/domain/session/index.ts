/**
 * Session domain barrel — re-exports the Hono session router for the Worker.
 *
 * Used by: `server/worker/src/index.ts` — mounted at `/sessions`
 * See also: `server/worker/src/domain/session/routes.ts` — route handlers
 */
export { sessions } from './routes';
