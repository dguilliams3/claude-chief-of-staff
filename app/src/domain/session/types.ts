/**
 * TypeScript type definitions for the session domain.
 *
 * Sessions represent Claude CLI session instances. Token usage metadata is
 * stored per-session in D1 and surfaced in the UI to show context window
 * consumption for the current briefing.
 *
 * Coupling: `worker/src/db/schema.ts::sessions` — D1 column shape
 * Coupling: `app/src/domain/briefing/types.ts::Briefing` — tokenUsage field
 * See also: `app/src/domain/session/api.ts` — HTTP client for session endpoints
 */

/**
 * Token usage metadata for a Claude CLI session.
 *
 * Populated by the briefing sync route from `briefing.usage` fields.
 * Used in the AppHeader meta row to display `29K/1M` context window usage.
 *
 * Coupling: `worker/src/domain/session/routes.ts` — API response shape
 * See also: `app/src/components/AppHeader/AppHeader.tsx` — renders token indicator
 */
export interface SessionTokenUsage {
  /** Total tokens consumed across all turns in this session */
  totalTokens: number;
  /** Maximum context window size for this session's model */
  contextWindow: number;
  /** Cumulative cost in USD for this session */
  totalCostUsd: number;
  /** ISO 8601 timestamp of the last activity in this session */
  lastUsedAt: string | null;
}

/**
 * Full session object returned by `GET /sessions/:id`.
 *
 * Coupling: `worker/src/domain/session/routes.ts` — must match API response shape
 * See also: `app/src/domain/session/api.ts` — HTTP client
 */
export interface Session {
  /** Claude CLI session ID string (not a UUID) */
  id: string;
  /** ISO 8601 timestamp of session creation */
  createdAt: string;
  /** Token usage metadata — may be absent for sessions before token tracking */
  tokenUsage?: SessionTokenUsage;
}
