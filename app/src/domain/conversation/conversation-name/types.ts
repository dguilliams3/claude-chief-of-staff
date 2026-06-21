/**
 * ConversationName type — the display name assigned to a conversation.
 *
 * Set by Claude on first response (via chatName in the follow-up response),
 * or by the user via a future rename UI. Stored in D1 conversations.name column.
 *
 * Coupling: `worker/src/routes/conversation-persistence.ts::updateConversationName` — D1 write
 * Coupling: `app/src/domain/conversation/types.ts::ConversationListItem` — carries this as `name` field
 * See also: `app/src/domain/conversation/conversation-name/assignConversationName.ts` — assignment logic
 */

/** The display name for a conversation. Null until Claude or the user assigns one. */
export type ConversationName = string;
