/**
 * Push subscription renewal — checks expiration and re-subscribes when stale.
 *
 * Browser push subscriptions expire after 30-90 days (vendor-dependent).
 * Most browsers don't set expirationTime, so we also use a time-based
 * defense-in-depth: re-subscribe weekly regardless.
 *
 * Used by: `app/src/store/index.ts` — called after auth alongside subscribeToPush
 * See also: `app/src/lib/push/subscribe.ts` — the actual subscribe flow
 * See also: `server/worker/src/domain/push/send.ts` — server-side 410/404 cleanup
 * Do NOT: Run on an interval — call once on app load, not in setInterval
 */

import { subscribeToPush } from './subscribe';

/** localStorage key for tracking last renewal timestamp. */
const LAST_RENEWAL_KEY = 'cos-push-last-renewal';

/** Re-subscribe if last renewal was more than 7 days ago. */
const RENEWAL_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

/** Re-subscribe if subscription expires within 7 days. */
const EXPIRY_BUFFER_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Checks whether the current push subscription needs renewal and re-subscribes if so.
 *
 * Renewal triggers:
 * 1. Subscription has an expirationTime that is expired or within 7 days of expiry
 * 2. No expirationTime set (most browsers) and last renewal was >7 days ago
 * 3. No record of any previous renewal (first-time defense-in-depth setup)
 *
 * When renewal is needed, unsubscribes the old subscription and calls subscribeToPush()
 * which creates a fresh subscription and POSTs it to the Worker. The old endpoint gets
 * cleaned up server-side on next 410 response.
 *
 * Used by: `app/src/store/index.ts` — called on auth success
 * See also: `app/src/lib/push/subscribe.ts::subscribeToPush`
 * Do NOT: Call before service worker is registered — subscribeToPush guards this internally
 *
 * @returns true if renewal happened, false if skipped or failed
 */
export async function checkAndRenewPushSubscription(): Promise<boolean> {
  // Guard: push not supported
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false;
  }

  // Guard: no notification permission
  if (Notification.permission !== 'granted') {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    // No existing subscription — subscribeToPush handles initial setup
    if (!subscription) {
      return false;
    }

    const now = Date.now();
    let needsRenewal = false;

    if (subscription.expirationTime !== null) {
      // Browser provides an expiration time — renew if expired or within buffer
      if (subscription.expirationTime <= now + EXPIRY_BUFFER_MS) {
        console.log('[Push Renewal] Subscription expired or expiring soon, renewing');
        needsRenewal = true;
      }
    } else {
      // No expiration time (most browsers) — use time-based renewal
      const lastRenewal = localStorage.getItem(LAST_RENEWAL_KEY);
      if (!lastRenewal) {
        // First time tracking — record current time, don't force renewal
        localStorage.setItem(LAST_RENEWAL_KEY, String(now));
        return false;
      }

      const elapsed = now - Number(lastRenewal);
      if (elapsed >= RENEWAL_INTERVAL_MS) {
        console.log('[Push Renewal] Weekly renewal interval reached, renewing');
        needsRenewal = true;
      }
    }

    if (!needsRenewal) {
      return false;
    }

    // Unsubscribe the OLD subscription FIRST, then re-subscribe. This is the
    // crux of renewal: subscribeToPush() reuses any *existing* PushSubscription,
    // so if we left the stale one in place it would simply re-register the same
    // (expiring) endpoint and we'd gain nothing. Dropping it first forces
    // subscribeToPush() down its `!subscription` branch and mints a genuinely
    // fresh endpoint.
    //
    // Safety: if the fresh subscribe fails after we've unsubscribed, we DON'T
    // stamp LAST_RENEWAL_KEY, so the next app load retries renewal instead of
    // sleeping for ~7 days with no push capability. The old endpoint gets
    // cleaned up server-side on its next 410 response regardless.
    await subscription.unsubscribe().catch(() => {
      // Non-fatal: a failed unsubscribe still lets subscribeToPush() refresh the
      // endpoint; the old one will 410 and get cleaned up server-side.
    });

    const success = await subscribeToPush();
    if (success) {
      localStorage.setItem(LAST_RENEWAL_KEY, String(now));
      console.log('[Push Renewal] Renewed successfully');
    } else {
      console.warn('[Push Renewal] Re-subscribe failed — will retry on next load');
    }
    return success;
  } catch (err) {
    console.error('[Push Renewal] Error during renewal check:', err);
    return false;
  }
}


