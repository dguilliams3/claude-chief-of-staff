/**
 * Briefing domain barrel — all briefing types and API functions.
 *
 * Upstream: `app/src/store/briefingSlice.ts`, components, views
 * See also: `app/src/domain/conversation/` — sibling domain
 */

// Types
export type { Briefing, BriefingListItem, BriefingSection, BriefingMetadata, Severity } from './types';

// Errors
export { BriefingError } from './errors';
export type { BriefingErrorCode } from './errors';

// API
export {
  fetchBriefings,
  triggerBriefing,
  fetchTriggerStatus,
  fetchBriefingList,
  fetchBriefingById,
  fetchBriefingTypes,
} from './api';
export type { BriefingTypeInfo } from './api';
