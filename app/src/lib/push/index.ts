/**
 * Push notification barrel — subscription helpers.
 *
 * Upstream: `app/src/store/index.ts` — calls subscribeToPush after auth
 * See also: `worker/src/domain/push/` — server-side subscribe/send endpoints
 * See also: `app/src/sw.ts` — service worker that handles incoming push events
 */

export { subscribeToPush } from './subscribe';
