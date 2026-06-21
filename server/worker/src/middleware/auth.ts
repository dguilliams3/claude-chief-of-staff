/**
 * Bearer token authentication middleware for the Cloudflare Worker API.
 *
 * Validates `Authorization: Bearer <token>` against the `COS_TOKEN` Worker secret.
 * Passes through OPTIONS requests for CORS preflight.
 *
 * Used by: `server/worker/src/index.ts` — mounted as `app.use('*', auth)`
 * See also: `server/local/server.ts` — local API has equivalent inline auth middleware
 * Coupling: `server/worker/src/types.ts::Env` — `COS_TOKEN` must be set as a Cloudflare secret
 * Do NOT: Add role-based logic — this is a single-user system with one shared token
 */
import type { Context, Next } from 'hono';
import type { Env } from '../types';

/**
 * Hono middleware that enforces bearer token authentication on all non-OPTIONS requests.
 *
 * Extracts the token from the `Authorization` header, compares it to `COS_TOKEN`
 * from Worker environment bindings, and returns 401 if missing or mismatched.
 *
 * @param c - Hono context with Worker bindings
 * @param next - Next middleware in the chain
 * @returns 401 JSON response on failure, or delegates to next middleware
 *
 * Upstream: `server/worker/src/index.ts` — `app.use('*', auth)`
 * Downstream: All route handlers (only reached if auth passes)
 * Do NOT: Log the token value — it is a secret
 */
export async function auth(c: Context<{ Bindings: Env }>, next: Next) {
  if (c.req.method === 'OPTIONS') return next();

  const header = c.req.header('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token || token !== c.env.COS_TOKEN) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  await next();
}
