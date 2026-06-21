/**
 * Conversation domain helpers barrel — re-exports all helper functions.
 *
 * Upstream: `app/src/domain/conversation/index.ts`
 * Upstream: `app/src/store/conversationSlice.ts`
 * Upstream: `app/src/components/ChatThread/ChatThread.tsx`
 */

export { mergeMessages } from './mergeMessages';
export { isAwaitingResponse, awaitingSince } from './awaitingResponse';
