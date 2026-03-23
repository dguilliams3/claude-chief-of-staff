/**
 * Chats view -- browsable list of persisted conversations with detail view.
 *
 * Third tab in header row 3 ("Current" | "History" | "Chats").
 * Shows conversation list sorted by last message or creation time,
 * with drill-down to full message history and ability to resume.
 *
 * Used by: `app/src/App.tsx` -- rendered when view === 'chats'
 * See also: `app/src/store/conversationSlice.ts` -- conversations state and actions
 * Do NOT: Fetch data directly -- store handles API calls and state updates
 */
import { useEffect } from 'react';
import { useStore } from '@/store';
import { ConversationDetail } from './ConversationDetail';
import type { ConversationListItem } from '@/domain/conversation';
import { formatTokens } from '@/components/AppHeader/AppHeader';

export function ChatsView() {
  const conversations = useStore((s) => s.conversations);
  const loading = useStore((s) => s.conversationsLoading);
  const selected = useStore((s) => s.selectedConversation);
  const fetchConversations = useStore((s) => s.fetchConversations);
  const selectConversation = useStore((s) => s.selectConversation);
  const createConversation = useStore((s) => s.createConversation);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  if (selected) {
    return <ConversationDetail />;
  }

  if (loading) {
    return <div className="p-4 text-center text-muted text-sm">Loading conversations...</div>;
  }

  async function handleNewChat() {
    try {
      const item = await createConversation();
      // Refresh list so new chat appears when user hits Back (await to ensure list is updated)
      // Refresh in background — don't block navigation on list refresh failure
      fetchConversations().catch(() => {});
      selectConversation({ conversation: item });
    } catch {
      // Silently fail — user can retry.
    }
  }

  if (conversations.length === 0) {
    return (
      <div className="p-4 text-center">
        <p className="text-muted text-sm mb-4">No conversations yet.</p>
        <button
          onClick={handleNewChat}
          className="text-sm text-accent hover:text-accent/80 transition-colors"
        >
          + New Chat
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-border-subtle">
      <button
        onClick={handleNewChat}
        className="flex items-center gap-2 p-4 text-sm text-accent hover:bg-surface-raised active:bg-surface transition-colors"
      >
        + New Chat
      </button>
      {conversations.map((conv) => (
        <ConversationRow
          key={conv.id}
          conversation={conv}
          onSelect={() => selectConversation({ conversation: conv })}
        />
      ))}
    </div>
  );
}

function ConversationRow({ conversation, onSelect }: {
  conversation: ConversationListItem;
  onSelect: () => void;
}) {
  const pendingFollowUp = useStore((s) => s.pendingFollowUp);
  // Match by historyKey — conversationId is always the primary key
  const thisHistoryKey = conversation.id;
  const isPending = !!pendingFollowUp && pendingFollowUp.historyKey === thisHistoryKey;

  const hasMessages = conversation.lastMessageAt && conversation.messageCount > 0;
  let timeStr: string;

  if (hasMessages) {
    const lastMsg = new Date(conversation.lastMessageAt!);
    const isToday = lastMsg.toDateString() === new Date().toDateString();
    timeStr = isToday
      ? lastMsg.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
      : lastMsg.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } else {
    timeStr = 'No messages';
  }

  // Smart display name: user-set name > "Work · Mar 18" > "Chat"
  let displayName: string;
  if (conversation.name) {
    displayName = conversation.name;
  } else if (conversation.briefingId && conversation.briefingType) {
    const typeLabel = conversation.briefingType === 'work' ? 'Work' : conversation.briefingType === 'news' ? 'News' : conversation.briefingType;
    const dateStr = conversation.briefingGeneratedAt
      ? new Date(conversation.briefingGeneratedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      : '';
    displayName = dateStr ? `${typeLabel} · ${dateStr}` : `${typeLabel} follow-up`;
  } else if (conversation.briefingId) {
    displayName = 'Briefing follow-up';
  } else {
    displayName = 'Chat';
  }

  const tokenDisplay = conversation.totalTokens != null
    ? formatTokens(conversation.totalTokens)
    : '—';

  return (
    <button
      onClick={onSelect}
      className="flex items-center justify-between p-4 text-left hover:bg-surface-raised active:bg-surface transition-colors"
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-primary">
          {displayName}
        </span>
        <span className="text-xs text-muted">
          {conversation.messageCount} message{conversation.messageCount !== 1 ? 's' : ''}
          <span className="mx-1 text-border">·</span>
          <span className="font-mono">{tokenDisplay}</span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        {/* Spinner shown when this conversation has an active follow-up poll */}
        {isPending && (
          <span className="w-3.5 h-3.5 border-2 border-muted/30 border-t-accent rounded-full animate-spin" />
        )}
        <span className="text-xs text-muted">{timeStr}</span>
      </div>
    </button>
  );
}
