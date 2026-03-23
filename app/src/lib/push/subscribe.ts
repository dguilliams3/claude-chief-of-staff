/**
 * Web Push subscription helpers — request permission, subscribe, unsubscribe.
 *
 * Handles the browser-side Web Push API flow:
 * 1. Request notification permission
 * 2. Get PushSubscription from service worker
 * 3. Send subscription to Worker for D1 storage
 *
 * Upstream: `app/src/store/index.ts` — called after login/auto-login success
 * Downstream: Worker `GET /push/vapid-public-key` — fetches VAPID key
 * Downstream: Worker `POST /push/subscribe` — stores subscription in D1
 * See also: `worker/src/domain/push/routes.ts` — server-side endpoints
 * See also: `app/src/sw.ts` — handles the push events this subscription receives
 * Do NOT: Call before service worker is registered — guard with navigator.serviceWorker.ready
 */

import { API_BASE, headers } from '@/lib/api';

/**
 * Fetches the VAPID public key from the Worker.
 * Cached in memory after first fetch.
 */
let cachedVapidKey: string | null = null;

async function getVapidPublicKey(): Promise<string | null> {
  if (cachedVapidKey) return cachedVapidKey;
  try {
    const res = await fetch(`${API_BASE}/push/vapid-public-key`, { headers: headers() });
    if (!res.ok) return null;
    const data = await res.json() as { publicKey: string };
    cachedVapidKey = data.publicKey;
    return data.publicKey;
  } catch {
    return null;
  }
}

/**
 * Converts a base64url string to a Uint8Array for applicationServerKey.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Requests notification permission and subscribes the browser for push notifications.
 *
 * Idempotent — safe to call multiple times (re-subscribing updates the subscription).
 * Returns true if successfully subscribed, false otherwise.
 *
 * Upstream: `app/src/store/index.ts` — called after login/auto-login
 * Downstream: `app/src/lib/push/subscribe.ts::getVapidPublicKey` → Worker `GET /push/vapid-public-key`
 * Downstream: Worker `POST /push/subscribe`
 */
export async function subscribeToPush(): Promise<boolean> {
  // Guard: notifications not supported
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    console.log('[Push] Not supported in this browser');
    return false;
  }

  // Check existing permission before requesting (avoids needless API calls)
  const existingPermission = Notification.permission;
  if (existingPermission === 'denied') {
    console.log('[Push] Permission previously denied');
    return false;
  }
  if (existingPermission !== 'granted') {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('[Push] Permission denied');
      return false;
    }
  }

  // Get VAPID key
  const vapidKey = await getVapidPublicKey();
  if (!vapidKey) {
    console.error('[Push] Failed to fetch VAPID public key');
    return false;
  }

  // Get service worker registration
  const registration = await navigator.serviceWorker.ready;

  // Check for existing subscription first (some browsers throw on re-subscribe)
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
    });
  }

  // Send subscription to Worker
  const subJson = subscription.toJSON();
  try {
    const res = await fetch(`${API_BASE}/push/subscribe`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        endpoint: subJson.endpoint,
        keys: subJson.keys,
      }),
    });
    if (!res.ok) {
      console.error('[Push] Subscribe API failed:', res.status);
      return false;
    }
    console.log('[Push] Subscribed successfully');
    return true;
  } catch (err) {
    console.error('[Push] Subscribe failed:', err);
    return false;
  }
}
