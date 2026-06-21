/**
 * Local Hono API server — serves briefing data and proxies claude CLI invocations.
 *
 * MAIN ENTRY POINT for the local API. Runs on port 3141, exposed to the internet
 * via cloudflared tunnel.
 *
 * Used by: Cloudflare Worker (via tunnel proxy for trigger/follow-up)
 * See also: `worker/src/` — cloud Worker that proxies to this server via tunnel
 * See also: `./routes/briefings` — filesystem briefing reads
 * See also: `./routes/claude` — claude CLI shell-out routes
 * Do NOT: Use `taskkill /F /IM node.exe` to stop — kills all Node including Claude Code.
 *         Target by port instead (see CLAUDE.md "Killing the local server").
 * Do NOT: Remove CORS middleware — PWA dev server needs cross-origin access.
 */
import 'dotenv/config';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBriefingRoutes } from './routes/briefings';
import { createClaudeRoutes } from './domain/conversation';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BRIEFINGS_DIR = resolve(__dirname, '..', '..', 'agent', 'briefings');

/** Bearer token for API authentication. Must match COS_TOKEN set in Worker secrets. */
const COS_TOKEN = process.env.COS_TOKEN ?? '';

if (!COS_TOKEN) {
  console.warn('⚠ COS_TOKEN not set — all requests will be rejected with 401');
}

const app = new Hono();

// CORS: restrict to CORS_ORIGIN if set, otherwise allow all origins.
const corsOrigin = process.env.CORS_ORIGIN;
app.use('*', cors(corsOrigin ? { origin: corsOrigin } : undefined));

app.use('*', async (c, next) => {
  if (c.req.method === 'OPTIONS') return next();
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  if (!COS_TOKEN || token !== COS_TOKEN) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  await next();
});

app.route('/briefings', createBriefingRoutes({ briefingsDir: BRIEFINGS_DIR }));
app.route('/briefings', createClaudeRoutes());

const port = parseInt(process.env.COS_PORT || '3141', 10);
console.log(`API listening on http://0.0.0.0:${port}`);
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' });
