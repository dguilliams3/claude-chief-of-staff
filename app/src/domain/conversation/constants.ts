/**
 * Conversation domain constants — shared sentinel values.
 *
 * Upstream: `app/src/store/conversationSlice.ts` — initial followUpHistory entries
 * See also: `app/src/domain/conversation/types.ts::Message` — the array element type
 */

import type { Message } from './types';

/**
 * Sentinel empty array for followUpHistory entries.
 * Prevents re-render loops from [] !== [] in Zustand selectors.
 * Always use this instead of a bare [] when initializing history.
 *
 * Tested by: `app/src/store/conversationSlice.test.ts`
 */
// Frozen to prevent accidental mutation. Cast to Message[] for Zustand store compatibility
// (store expects mutable arrays, but EMPTY_HISTORY should never be mutated — always spread).
export const EMPTY_HISTORY: Message[] = Object.freeze([]) as unknown as Message[];
