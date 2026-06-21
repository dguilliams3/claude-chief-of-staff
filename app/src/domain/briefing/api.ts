/**
 * Briefing domain API client — all HTTP functions for briefing CRUD and trigger lifecycle.
 *
 * Handles fetching latest briefings, historical list, individual briefing detail,
 * available types, trigger generation, and trigger status polling.
 *
 * Upstream: `app/src/store/briefingSlice.ts` — all briefing store actions
 * Downstream: Worker briefing endpoints → D1 queries
 * See also: `app/src/domain/briefing/types.ts` — type contracts
 * Do NOT: Put conversation functions here — those go in `domain/conversation/api.ts`
 */

import { API_BASE, headers } from '@/lib/api';
import type { Briefing, BriefingListItem } from './types';
import { BriefingError } from './errors';
import type { BriefingErrorCode } from './errors';

/** Maps HTTP status codes to BriefingErrorCode for structured error handling. */
function codeFromStatus(status: number): BriefingErrorCode {
  if (status === 401 || status === 403) return 'UNAUTHORIZED';
  if (status === 404) return 'NOT_FOUND';
  return 'FETCH_FAILED';
}

/** Briefing type metadata returned by GET /briefings/types. */
export interface BriefingTypeInfo {
  key: string;
  label: string;
  description: string;
}

/**
 * Fetches the latest briefings from the Worker API, keyed by type.
 *
 * @returns Record of briefings keyed by type string (e.g., "work", "news")
 * @throws On network error or non-200 response
 *
 * Upstream: `app/src/store/briefingSlice.ts::fetchAndSet`
 * Downstream: Worker `GET /briefings/latest` → D1 query
 */
export async function fetchBriefings(): Promise<Record<string, Briefing>> {
  const res = await fetch(`${API_BASE}/briefings/latest`, { headers: headers() });
  if (!res.ok) throw new BriefingError(`API error: ${res.status}`, codeFromStatus(res.status), res.status);
  return res.json();
}

/**
 * Triggers generation of a new briefing of the given type via the local tunnel.
 *
 * @param options - Named parameters
 * @param options.type - Briefing type to generate (e.g., "work", "news")
 * @returns Status and jobId for polling
 * @throws On network error or non-200 response
 *
 * Upstream: `app/src/store/briefingSlice.ts::triggerBriefing`
 * Downstream: Worker `POST /briefings/trigger` → tunnel → local API → `claude --print`
 */
export async function triggerBriefing({ type, sessionId }: { type: string; sessionId?: string }) {
  const res = await fetch(`${API_BASE}/briefings/trigger`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(sessionId ? { type, sessionId } : { type }),
  });
  if (!res.ok) throw new BriefingError(`API error: ${res.status}`, codeFromStatus(res.status), res.status);
  return res.json() as Promise<{ status: string; type: string; jobId: string }>;
}

/**
 * Polls trigger job status by jobId.
 *
 * @param options - Named parameters
 * @param options.jobId - Job UUID from triggerBriefing response
 * @returns Job status object from the trigger queue
 * @throws On network error or non-200 response
 *
 * Upstream: `app/src/store/briefingSlice.ts::triggerBriefing` polling loop
 * Downstream: Worker `GET /briefings/status/:jobId` → tunnel → local API
 */
export async function fetchTriggerStatus({ jobId, signal }: { jobId: string; signal?: AbortSignal }) {
  const res = await fetch(`${API_BASE}/briefings/status/${jobId}`, {
    headers: headers(),
    signal,
  });
  if (!res.ok) throw new BriefingError(`Status check failed: ${res.status}`, codeFromStatus(res.status), res.status);
  return res.json() as Promise<{
    id: string;
    type: string;
    status: 'running' | 'completed' | 'failed';
    briefingId?: string;
    error?: string;
  }>;
}

/**
 * Fetches the full list of historical briefings (lightweight items, no sections).
 *
 * @returns Array of BriefingListItem objects
 * @throws On network error or non-200 response
 *
 * Upstream: `app/src/store/briefingSlice.ts::fetchHistory`
 * Downstream: Worker `GET /briefings` → D1 query
 */
export async function fetchBriefingList(): Promise<BriefingListItem[]> {
  const res = await fetch(`${API_BASE}/briefings`, { headers: headers() });
  if (!res.ok) throw new BriefingError(`API error: ${res.status}`, codeFromStatus(res.status), res.status);
  return res.json() as Promise<BriefingListItem[]>;
}

/**
 * Fetches a single briefing by its unique ID, including full sections and metadata.
 *
 * @param options - Named parameters
 * @param options.id - Briefing UUID
 * @returns Full Briefing object
 * @throws On network error or non-200 response
 *
 * Upstream: `app/src/store/briefingSlice.ts::selectBriefing`
 * Downstream: Worker `GET /briefings/:id` → D1 query
 */
export async function fetchBriefingById({ id }: { id: string }): Promise<Briefing> {
  const res = await fetch(`${API_BASE}/briefings/${encodeURIComponent(id)}`, { headers: headers() });
  if (!res.ok) throw new BriefingError(`API error: ${res.status}`, codeFromStatus(res.status), res.status);
  return res.json() as Promise<Briefing>;
}

/**
 * Fetches available briefing types with labels and descriptions.
 *
 * @returns Array of BriefingTypeInfo objects
 * @throws On network error or non-200 response
 *
 * Upstream: `app/src/store/index.ts` — called on login/init
 * Downstream: Worker `GET /briefings/types` — static from shared/briefing-types.json
 */
export async function fetchBriefingTypes(): Promise<BriefingTypeInfo[]> {
  const res = await fetch(`${API_BASE}/briefings/types`, { headers: headers() });
  if (!res.ok) throw new BriefingError(`API error: ${res.status}`, codeFromStatus(res.status), res.status);
  const data = await res.json() as { types: BriefingTypeInfo[] };
  return data.types;
}
