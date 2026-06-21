/**
 * PWA service worker — Workbox precaching and Web Push notification handling.
 *
 * Compiled by Vite at build time via vite-plugin-pwa (InjectManifest strategy).
 * Handles install/activate lifecycle, push events, and notification clicks.
 *
 * Suppresses push notifications when the PWA is actively visible on the receiving device
 * (each device's SW decides independently — no cross-device coordination).
 *
 * Used by: Browser runtime — registered automatically by vite-plugin-pwa
 * See also: `app/src/lib/push/subscribe.ts` — registers the subscription with the server
 * See also: `worker/src/domain/push/send.ts` — sends pushes to this SW
 * Do NOT: Import from @/store or React modules — service workers run outside the React context
 */
/// <reference lib="webworker" />

import { precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

// Workbox precaching — injected by vite-plugin-pwa at build time
precacheAndRoute(self.__WB_MANIFEST);

// Skip waiting + claim clients for immediate activation
self.addEventListener('install', () => {
  void self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Web Push notification handler
// Suppresses notification if the PWA is actively visible on this device.
// Each device's SW decides independently — no cross-device coordination needed.
// TODO: UIInstance presence model when multi-user/distribution lands
self.addEventListener('push', (event) => {
  if (!event.data) return;

  event.waitUntil((async () => {
    // Check if any PWA window is actively visible on THIS device
    const clients = await self.clients.matchAll({ type: 'window' });
    const hasVisibleClient = clients.some(c => c.visibilityState === 'visible');
    if (hasVisibleClient) return; // User is looking at it on this device, skip

    try {
      const payload = event.data!.json() as {
        title?: string;
        body?: string;
        url?: string;
        icon?: string;
      };

      const title = payload.title ?? 'Briefing ready';
      const options: NotificationOptions = {
        body: payload.body ?? '',
        icon: payload.icon ?? '/icon-192.png',
        badge: '/icon-192.png',
        data: { url: payload.url ?? '/' },
      };

      await self.registration.showNotification(title, options);
    } catch {
      // Fallback for non-JSON payloads
      const text = event.data!.text();
      await self.registration.showNotification('Briefing ready', { body: text });
    }
  })());
});

// Notification click handler — open PWA to the briefing
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = (event.notification.data as { url?: string })?.url ?? '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clientList) => {
      // Filter to only app windows (same scope), not random browser tabs
      const appClients = clientList.filter(client => client.url.startsWith(self.registration.scope));
      if (appClients.length > 0) {
        const client = appClients[0];
        await client.focus();
        client.navigate?.(url);
        return;
      }
      // No app window open — open a new one
      return self.clients.openWindow(url);
    }),
  );
});
