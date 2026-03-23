/**
 * Standard HTTP headers builder for all API requests.
 *
 * Includes Authorization header only when an auth token is set.
 * Every domain API module should call this instead of building headers manually.
 *
 * Upstream: `app/src/domain/briefing/api.ts`, `app/src/domain/conversation/api.ts`
 * Downstream: `app/src/lib/api/authToken.ts::getAuthToken`
 * Do NOT: Add domain-specific headers here — this is generic infrastructure
 */

import { getAuthToken } from './authToken';

/**
 * Builds the standard headers object for all API requests.
 *
 * @returns Headers record with Content-Type and optional Authorization
 *
 * Upstream: `app/src/domain/briefing/api.ts`, `app/src/domain/conversation/api.ts` — every fetch call
 * Downstream: `app/src/lib/api/authToken.ts::getAuthToken`
 * Tested by: `app/src/api.test.ts`
 */
export function headers(): Record<string, string> {
  const headerRecord: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAuthToken();
  if (token) headerRecord['Authorization'] = `Bearer ${token}`;
  return headerRecord;
}
