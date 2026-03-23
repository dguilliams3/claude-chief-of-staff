/**
 * Lightweight auth token validation — calls GET /auth/validate.
 *
 * Returns true if the token is valid (200), false otherwise.
 * Does NOT depend on any domain module (briefing, conversation) — this is
 * pure auth infrastructure.
 *
 * Upstream: `app/src/store/authSlice.ts` — login and auto-login validation
 * Downstream: Worker `GET /auth/validate` — returns 200 or 401
 * See also: `app/src/lib/api/authToken.ts` — token storage
 * Do NOT: Return domain data — this is validation only
 */

import { API_BASE } from './constants';
import { headers } from './headers';

/**
 * Validates the current auth token against the Worker.
 *
 * @returns true if the token is valid (HTTP 200), false otherwise
 *
 * Upstream: `app/src/store/authSlice.ts::login`, `app/src/store/authSlice.ts::initAutoLogin`
 * Downstream: Worker `GET /auth/validate`
 */
export async function validateAuthToken(): Promise<boolean> {
  const res = await fetch(`${API_BASE}/auth/validate`, { headers: headers() });
  return res.ok;
}
