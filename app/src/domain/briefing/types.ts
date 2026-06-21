/**
 * TypeScript type definitions for the briefing domain.
 *
 * STABLE CONTRACT — these types define the shape of data stored in D1
 * and returned by the Worker API. Changes here must be mirrored in the
 * Worker route handlers and D1 schema.
 *
 * Coupling: `worker/src/routes/briefings.ts` — Worker returns these shapes
 * Coupling: `app/src/store/briefingSlice.ts` — store holds `Record<string, Briefing>`
 * See also: `app/src/domain/briefing/api.ts` — HTTP client that fetches these types
 * See also: `app/src/domain/session/types.ts::SessionTokenUsage` — token usage shape
 */

import type { SessionTokenUsage } from '@/domain/session/types';

/**
 * Severity level for a briefing section. Controls badge color and sort priority.
 *
 * - `info`: Normal, no action needed
 * - `warn`: Attention recommended
 * - `flag`: Urgent, action required
 *
 * Coupling: `app/src/components/SectionCard/SectionCard.tsx` — maps severity to badge CSS classes
 */
export type Severity = 'info' | 'warn' | 'flag';

/**
 * A single section within a briefing (e.g., "This Week", "Untracked Commitments").
 *
 * Coupling: `worker/src/routes/briefings.ts` — stored as JSON array in D1 `sections` column
 * See also: `app/src/components/SectionCard/SectionCard.tsx` — renders one of these per card
 */
export interface BriefingSection {
  /** Unique key for the section (e.g., "THIS_WEEK", "EAST_PENN") */
  key: string;
  /** Human-readable section title displayed in the UI */
  label: string;
  /** Markdown-formatted section body */
  content: string;
  /** Visual severity indicator for this section */
  severity: Severity;
}

/**
 * Operational metadata about how a briefing was generated.
 *
 * Coupling: `agent/prompts/` — the agent runner populates these fields
 * See also: `app/src/views/TodayView/TodayView.tsx` — displays metadata summary
 */
export interface BriefingMetadata {
  /** Data sources that were queried during generation (e.g., ["jira", "fireflies"]) */
  sourcesSampled: string[];
  /** Wall-clock duration of the briefing generation run in milliseconds */
  runDurationMs: number;
  /** Estimated LLM cost in USD for this generation */
  costUsd: number;
  /** Whether an existing Claude session was resumed (vs. new session) */
  sessionResumed: boolean;
  /** Sequential briefing counter for this type */
  briefingNumber: number;
}

/**
 * Full briefing object with all sections and metadata.
 * This is the complete shape stored in D1 and returned by `GET /briefings/:id`.
 *
 * Coupling: `worker/src/routes/briefings.ts` — must match D1 row shape
 * Coupling: `app/src/store/briefingSlice.ts` — `briefings` state holds `Record<string, Briefing>`
 * See also: `app/src/domain/briefing/types.ts::BriefingListItem` — lightweight list variant
 */
export interface Briefing {
  /** Unique briefing UUID */
  id: string;
  /** Briefing type key (e.g., "morning", "field") */
  type: string;
  /** ISO 8601 timestamp of when the briefing was generated */
  generatedAt: string;
  /** Claude session ID, used for follow-up questions */
  sessionId: string;
  /** Ordered array of briefing sections */
  sections: BriefingSection[];
  /** Generation metadata (sources, cost, duration) */
  metadata: BriefingMetadata;
  /**
   * Token usage for the session associated with this briefing.
   * Absent for briefings generated before token tracking was added,
   * or if the session row has no token data yet.
   *
   * Populated by JOIN on sessions table in `GET /briefings/latest`.
   * See also: `app/src/components/AppHeader/AppHeader.tsx` — renders 29K/1M indicator
   */
  tokenUsage?: SessionTokenUsage;
}

/**
 * Lightweight briefing list item returned by `GET /briefings`.
 * Intentionally excludes sections and sessionId to reduce payload size.
 *
 * Coupling: `worker/src/routes/briefings.ts` — must match D1 query projection
 * See also: `app/src/domain/briefing/types.ts::Briefing` — full object shape
 */
export interface BriefingListItem {
  /** Unique briefing UUID */
  id: string;
  /** Briefing type key (e.g., "morning", "field") */
  type: string;
  /** ISO 8601 timestamp of when the briefing was generated */
  generatedAt: string;
  /** Number of sections in the full briefing */
  sectionCount: number;
  /** Highest severity across all sections in this briefing */
  maxSeverity: Severity;
  /** Sequential briefing counter for this type */
  briefingNumber: number | null;
}
