/**
 * Briefing domain barrel — re-exports the Hono briefing router for the Worker.
 *
 * Used by: `server/worker/src/index.ts` — mounted at `/briefings`
 * See also: `server/worker/src/domain/briefing/routes.ts` — route handlers
 */
export { briefings } from './routes';
