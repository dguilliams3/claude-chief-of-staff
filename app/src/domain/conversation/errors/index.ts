/**
 * Conversation domain error barrel — re-exports all error classes.
 *
 * Upstream: `app/src/domain/conversation/api.ts`
 * Upstream: `app/src/store/conversationSlice.ts`
 */

export { FollowUpError } from './FollowUpError';
export { ConversationError } from './ConversationError';
export type { ConversationErrorCode } from './ConversationError';
