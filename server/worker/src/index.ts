/**
 * Cloudflare Worker entry point — Hono app serving the API.
 *
 * MAIN ENTRY POINT for the cloud-side API. Mounts CORS, bearer auth middleware,
 * briefing CRUD routes (D1-backed), tunnel proxy routes (forwarding to local API),
 * and conversation read routes (D1-backed, for Chats tab and FollowUpBar hydration).
 *
 * Used by: PWA via domain API modules in `app/src/domain/`
 * See also: `server/local/server.ts` — local Hono API that tunnel proxy routes forward to
 * See also: `server/worker/src/types.ts::Env` — Worker bindings (DB, TUNNEL_URL, COS_TOKEN)
 * See also: `server/worker/src/domain/briefing/` — briefing domain (CRUD routes, sync)
 * See also: `server/worker/src/domain/conversation/` — conversation domain (routes, proxy, persistence)
 * See also: `server/worker/src/domain/session/` — session domain (token metadata CRUD)
 * Do NOT: Add routes directly here — mount sub-routers via `app.route()`
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import { auth } from './middleware/auth';
import { briefings } from './domain/briefing';
import { proxy, conversations } from './domain/conversation';
import { sessions } from './domain/session';
import { push } from './domain/push';
import { exportRoutes } from './domain/export';

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors({
  origin: (origin, c) => {
    const allowed = c.env.CORS_ORIGIN;
    if (!allowed) return origin;
    return origin === allowed ? origin : '';
  },
}));

// Health check — unauthenticated, before auth middleware
app.get('/health', (c) => c.json({ status: 'ok' }));

app.use('*', auth);

// Auth validation — lightweight endpoint for token check (no data, no domain deps)
app.get('/auth/validate', (c) => c.json({ valid: true }));

app.route('/briefings', briefings);
app.route('/briefings', proxy);
app.route('/conversations', conversations);
app.route('/sessions', sessions);
app.route('/push', push);
app.route('/exports', exportRoutes);

export default app;
