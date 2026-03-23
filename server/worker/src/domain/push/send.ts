/**
 * Web Push send utility — sends push notifications to all subscribed browsers.
 *
 * Uses @block65/webcrypto-web-push for VAPID signing via WebCrypto API
 * (Cloudflare Workers compatible — no Node.js crypto dependency).
 *
 * Upstream: `server/worker/src/domain/briefing/routes.ts` — called after briefing sync
 * Downstream: D1 `push_subscriptions` table — reads all subscription endpoints
 * See also: `server/worker/src/domain/push/routes.ts` — subscribe/unsubscribe endpoints
 * Do NOT: Throw on individual push failures — log and continue to next subscription
 */

import {
  buildPushPayload,
  type PushSubscription as WebPushSubscription,
} from '@block65/webcrypto-web-push';

/** Payload shape sent to the service worker. */
export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
}

/**
 * Sends a push notification to all subscribed browsers.
 *
 * @param db - D1 database binding
 * @param payload - Notification title, body, url, icon
 * @param vapid - VAPID credentials from Worker env
 * @returns Number of successful sends
 */
export async function sendPushToAll(
  db: D1Database,
  payload: PushPayload,
  vapid: { publicKey: string; privateKey: string; subject: string },
): Promise<number> {
  const rows = await db.prepare(
    'SELECT endpoint, p256dh, auth FROM push_subscriptions'
  ).all();

  if (!rows.results.length) return 0;

  let successCount = 0;

  for (const row of rows.results) {
    const r = row as Record<string, string>;
    const subscription: WebPushSubscription = {
      endpoint: r.endpoint,
      expirationTime: null,
      keys: {
        p256dh: r.p256dh,
        auth: r.auth,
      },
    };

    try {
      // buildPushPayload(message, subscription, vapid)
      // message: { data: T } — the notification payload
      // subscription: { endpoint, keys: { p256dh, auth } }
      // vapid: { subject, publicKey, privateKey }
      const { headers, body } = await buildPushPayload(
        { data: payload as unknown as Record<string, unknown> },
        subscription,
        {
          subject: vapid.subject,
          publicKey: vapid.publicKey,
          privateKey: vapid.privateKey,
        },
      );

      const res = await fetch(r.endpoint, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(10_000), // 10s per push — don't let a slow endpoint block all others
      });

      if (res.ok || res.status === 201) {
        successCount++;
      } else if (res.status === 404 || res.status === 410) {
        // Subscription expired or unsubscribed — remove from D1
        await db.prepare(
          'DELETE FROM push_subscriptions WHERE endpoint = ?'
        ).bind(r.endpoint).run();
        console.log(`Removed expired push subscription: ${r.endpoint.slice(0, 50)}...`);
      } else {
        console.error(`Push failed for ${r.endpoint.slice(0, 50)}: ${res.status}`);
      }
    } catch (err) {
      console.error(`Push error for ${r.endpoint.slice(0, 50)}:`, err);
    }
  }

  return successCount;
}

/**
 * Computes a severity summary string from briefing sections.
 *
 * @param sections - Array of briefing sections with optional severity field
 * @returns Human-readable summary like "2 flags, 1 warning" or "all clear"
 *
 * Upstream: `server/worker/src/domain/briefing/routes.ts::POST /sync` — formats push body
 */
export function computeSeveritySummary(sections: { severity?: string }[]): string {
  const counts = { flag: 0, warn: 0, info: 0 };
  for (const s of sections) {
    const sev = s.severity ?? 'info';
    if (sev in counts) counts[sev as keyof typeof counts]++;
  }

  const parts: string[] = [];
  if (counts.flag > 0) parts.push(`${counts.flag} flag${counts.flag > 1 ? 's' : ''}`);
  if (counts.warn > 0) parts.push(`${counts.warn} warning${counts.warn > 1 ? 's' : ''}`);

  if (parts.length === 0) return 'all clear';
  return parts.join(', ');
}
