/**
 * TypeScript type definitions for the Cloudflare Worker environment.
 *
 * Defines the `Env` bindings interface used by Hono's generic parameter
 * throughout all Worker routes and middleware.
 *
 * Used by: `server/worker/src/index.ts`, `server/worker/src/domain/briefing/routes.ts`,
 *          `server/worker/src/domain/conversation/proxy.ts`, `server/worker/src/middleware/auth.ts`,
 *          `server/worker/src/domain/push/routes.ts`, `server/worker/src/domain/session/routes.ts`
 * Coupling: Cloudflare `wrangler.toml` — binding names must match these keys
 * See also: `CLAUDE.md` — Cloudflare-only deployment rule
 */

/**
 * Cloudflare Worker environment bindings.
 *
 * - `DB`: D1 database binding for the briefings database
 * - `TUNNEL_URL`: Base URL of the cloudflared tunnel
 * - `COS_TOKEN`: Bearer token secret for API authentication
 * - `CORS_ORIGIN`: Optional allowed CORS origin for the Worker
 * - `VAPID_PUBLIC_KEY`: VAPID public key for Web Push (base64url encoded) — NOT a secret
 * - `VAPID_PRIVATE_KEY`: VAPID private key for Web Push signing — must be a CF secret
 * - `VAPID_SUBJECT`: VAPID subject URI (e.g., `mailto:admin@example.com`) — required by push services
 *
 * Coupling: `wrangler.toml` — `[vars]` and `[[d1_databases]]` sections define these
 * See also: `server/worker/src/middleware/auth.ts::auth` — consumes `COS_TOKEN`
 * See also: `server/worker/src/domain/conversation/proxy.ts` — consumes `TUNNEL_URL`
 * See also: `server/worker/src/domain/push/send.ts::sendPushToAll` — consumes VAPID_* vars
 * See also: `server/worker/src/domain/push/routes.ts` — serves VAPID_PUBLIC_KEY to PWA
 */
export type Env = {
  DB: D1Database;
  TUNNEL_URL: string;
  COS_TOKEN: string;
  CORS_ORIGIN?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  EXPORTS_BUCKET?: R2Bucket;
};
