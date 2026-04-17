/**
 * Push subscription routes — subscribe/unsubscribe for Web Push notifications.
 *
 * Manages browser push subscriptions in D1. Called by the PWA after the user
 * grants notification permission.
 *
 * Used by: `server/worker/src/domain/push/index.ts` — barrel export
 * Used by: `server/worker/src/index.ts` — mounted at `/push`
 * See also: `server/worker/src/domain/push/send.ts` — sends pushes using stored subscriptions
 * See also: `server/worker/src/db/schema.ts::pushSubscriptions` — D1 table definition
 * Do NOT: Send pushes from here — that's done in the briefing sync route
 */
import { Hono } from 'hono';
import type { Env } from '../../types';

const push = new Hono<{ Bindings: Env }>();

/**
 * POST /subscribe — stores a browser push subscription in D1.
 *
 * Expects `{ endpoint, keys: { p256dh, auth } }` from the PushManager.subscribe() result.
 * Uses INSERT OR REPLACE keyed on endpoint (UNIQUE) so re-subscribing is idempotent.
 *
 * Upstream: `app/src/lib/push/subscribe.ts`
 * Downstream: D1 `push_subscriptions` table
 */
push.post('/subscribe', async (c) => {
  const body = await c.req.json<{
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  }>();

  const { endpoint, keys } = body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return c.json({ error: 'endpoint and keys.p256dh/auth required' }, 400);
  }

  // Validate endpoint is a legitimate push service URL (https only)
  try {
    const endpointUrl = new URL(endpoint);
    if (endpointUrl.protocol !== 'https:') {
      return c.json({ error: 'Push endpoint must use HTTPS' }, 400);
    }
  } catch {
    return c.json({ error: 'Invalid push endpoint URL' }, 400);
  }

  // Use endpoint hash as deterministic ID for idempotent upsert
  const id = await generateId(endpoint);

  await c.env.DB.prepare(`
    INSERT OR REPLACE INTO push_subscriptions (id, endpoint, p256dh, auth)
    VALUES (?, ?, ?, ?)
  `).bind(id, endpoint, keys.p256dh, keys.auth).run();

  return c.json({ status: 'ok', id });
});

/**
 * POST /unsubscribe — removes a push subscription from D1.
 *
 * Upstream: `app/src/lib/push/subscribe.ts`
 * Downstream: D1 `push_subscriptions` table
 */
push.post('/unsubscribe', async (c) => {
  const body = await c.req.json<{ endpoint?: string }>();
  if (!body.endpoint) {
    return c.json({ error: 'endpoint required' }, 400);
  }

  await c.env.DB.prepare(
    'DELETE FROM push_subscriptions WHERE endpoint = ?'
  ).bind(body.endpoint).run();

  return c.json({ status: 'ok' });
});

/**
 * GET /vapid-public-key — returns the VAPID public key for client subscription.
 *
 * Called by the PWA to get the applicationServerKey for PushManager.subscribe().
 * This is NOT a secret — it's the public half of the VAPID key pair.
 *
 * Upstream: `app/src/lib/push/subscribe.ts`
 */
push.get('/vapid-public-key', (c) => {
  const key = c.env.VAPID_PUBLIC_KEY;
  if (!key) return c.json({ error: 'VAPID not configured' }, 500);
  return c.json({ publicKey: key });
});

/** Generates a deterministic ID from an endpoint URL via SHA-256. */
async function generateId(endpoint: string): Promise<string> {
  const data = new TextEncoder().encode(endpoint);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(hash);
  return Array.from(bytes.slice(0, 16))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export { push };
