/**
 * Session domain API client — HTTP functions for session token metadata.
 *
 * Sessions are read-only from the PWA perspective. These functions fetch
 * session data from the Worker API for display in the UI (e.g., token counts).
 *
 * Upstream: Components or store actions needing session token data
 * Downstream: Worker session endpoints → D1 sessions table
 * See also: `app/src/domain/session/types.ts` — type contracts
 * Do NOT: Write session data — sessions are written by the briefing sync route
 */

import { API_BASE, headers } from '@/lib/api';
import { BriefingError } from '@/domain/briefing/errors';
import type { Session } from './types';

/** Maps HTTP status codes to BriefingErrorCode for structured error handling. */
function codeFromStatus(status: number) {
  if (status === 401 || status === 403) return 'UNAUTHORIZED' as const;
  if (status === 404) return 'NOT_FOUND' as const;
  return 'FETCH_FAILED' as const;
}

/**
 * Fetches all sessions from the Worker API.
 *
 * @returns Array of Session objects
 * @throws BriefingError on network error or non-200 response
 *
 * Upstream: `app/src/components/AppHeader/SessionDropdown.tsx::SessionDropdown`
 * Downstream: Worker `GET /sessions` → D1 sessions table
 */
export async function fetchSessions(): Promise<Session[]> {
  const res = await fetch(`${API_BASE}/sessions`, { headers: headers() });
  if (!res.ok) {
    throw new BriefingError(`API error: ${res.status}`, codeFromStatus(res.status), res.status);
  }
  return res.json() as Promise<Session[]>;
}

/**
 * Fetches a single session by its Claude CLI session ID.
 *
 * @param options - Named parameters
 * @param options.id - Claude CLI session ID string
 * @returns Full Session object including token usage metadata
 * @throws BriefingError on network error or non-200 response
 *
 * Downstream: Worker `GET /sessions/:id` → D1 sessions table
 */
export async function fetchSessionById({ id }: { id: string }): Promise<Session> {
  const res = await fetch(`${API_BASE}/sessions/${encodeURIComponent(id)}`, { headers: headers() });
  if (!res.ok) {
    throw new BriefingError(`API error: ${res.status}`, codeFromStatus(res.status), res.status);
  }
  return res.json() as Promise<Session>;
}
