/**
 * API base URL constant — resolved from environment or defaults to localhost.
 *
 * Upstream: `app/src/domain/briefing/api.ts`, `app/src/domain/conversation/api.ts` — all domain API modules
 * Do NOT: Hardcode URLs in domain API files — always import from here
 */

/**
 * Cloudflare Worker base URL. Set `VITE_API_URL` in `.env` for non-localhost targets.
 *
 * Upstream: `app/src/domain/briefing/api.ts`, `app/src/domain/conversation/api.ts`
 * Do NOT: Hardcode URLs in domain API files — always import this constant
 */
export const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3141';
