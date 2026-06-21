/**
 * Shared API infrastructure — auth token management, headers, and base URL.
 *
 * Every domain API module imports from here for HTTP plumbing.
 * Domain-specific logic (fetch functions, error classes) lives in domain directories.
 *
 * Upstream: `app/src/domain/briefing/api.ts`, `app/src/domain/conversation/api.ts`
 * See also: `app/src/lib/polling/` — sibling infrastructure module
 * Do NOT: Put domain-specific fetch functions here — those belong in domain API modules
 */

export { setAuthToken, getAuthToken } from './authToken';
export { headers } from './headers';
export { API_BASE } from './constants';
export { validateAuthToken } from './validateAuth';
