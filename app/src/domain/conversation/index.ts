/**
 * Conversation domain barrel — all conversation types, API functions,
 * error classes, constants, and helpers.
 *
 * Upstream: `app/src/store/conversationSlice.ts`, components, views
 * See also: `app/src/domain/briefing/` — sibling domain
 */

// Types
export type {
  MessageRole,
  Message,
  ConversationListItem,
  Conversation,
  FollowUpResponse,
  FollowUpJobStatus,
} from './types';

// API
export {
  sendFollowUp,
  fetchFollowUpStatus,
  fetchConversations,
  fetchConversationMessages,
  fetchConversationByBriefing,
  createConversation,
  updateConversationName,
} from './api';

// Errors
export { FollowUpError, ConversationError } from './errors';
export type { ConversationErrorCode } from './errors';

// Constants
export { EMPTY_HISTORY } from './constants';

// Helpers
export { mergeMessages, isAwaitingResponse, awaitingSince } from './helpers';

// Conversation Name
export type { ConversationName } from './conversation-name';
export { assignConversationName } from './conversation-name';
