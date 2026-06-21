/**
 * Module-level bearer token management — set once on login, cleared on logout.
 *
 * The token is stored in module scope (not Zustand) because it's needed by
 * fetch calls that run outside the React lifecycle (e.g., fire-and-forget
 * name persistence). Zustand hooks can't be called outside components.
 *
 * Downstream: `app/src/lib/api/headers.ts` — reads the token
 * Upstream: `app/src/store/index.ts::login`, `app/src/store/index.ts::logout`
 * Do NOT: Import this in components — use `setAuthToken` from the barrel
 */

/** Module-level bearer token, set once on login and cleared on logout. */
let authToken = '';

/**
 * Sets the bearer token used for all subsequent API requests.
 *
 * @param token - Bearer token string (raw, without "Bearer " prefix)
 *
 * Upstream: `app/src/store/authSlice.ts::login`, `app/src/store/authSlice.ts::logout`
 * Downstream: Writes to module-scoped `authToken` variable — read by `getAuthToken`
 * Tested by: `app/src/api.test.ts`
 */
export function setAuthToken(token: string) {
  authToken = token;
}

/**
 * Returns the current auth token. Used internally by headers().
 *
 * @returns The current bearer token, or empty string if not set
 *
 * Upstream: `app/src/lib/api/headers.ts::headers`
 * Downstream: Reads from module-scoped `authToken` variable
 */
export function getAuthToken(): string {
  return authToken;
}
