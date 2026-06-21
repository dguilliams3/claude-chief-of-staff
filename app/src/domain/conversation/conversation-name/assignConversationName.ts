/**
 * Assigns a name to a conversation in a ConversationListItem array.
 *
 * Pure function — returns a new array with the matching conversation's
 * name updated. Used when Claude generates a chatName on first response.
 * Future: also used when the user renames a conversation via UI.
 *
 * Upstream: `app/src/store/conversationSlice.ts` — called in follow-up completion handler
 * Downstream: None — pure data transformation
 * See also: `app/src/domain/conversation/conversation-name/types.ts::ConversationName`
 * Do NOT: Persist to D1 here — the Worker already persists chatName on completion poll
 */

import type { ConversationListItem } from '@/domain/conversation/types';
import type { ConversationName } from './types';

/**
 * Returns a new array with the specified conversation's name updated.
 *
 * @param conversations - The current briefingConversations array
 * @param conversationId - The conversation to assign the name to
 * @param name - The name to assign (from Claude's chatName or user input)
 * @returns New array with the updated conversation (original array is not mutated)
 */
export function assignConversationName(
  conversations: ConversationListItem[],
  conversationId: string,
  name: ConversationName,
): ConversationListItem[] {
  return conversations.map(conversation =>
    conversation.id === conversationId
      ? { ...conversation, name }
      : conversation
  );
}
