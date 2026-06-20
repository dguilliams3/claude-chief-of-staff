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
      fetchConversations().catch(() => {});
      selectConversation({ conversation: item });
    } catch {
      // Silently fail -- user can retry.
    }
  }

  if (conversations.length === 0) {
    return (
      <div className="p-4 text-center">
        <p className="mb-4 text-sm text-muted">No conversations yet.</p>
        <button
          onClick={handleNewChat}
          className="text-sm text-accent transition-colors hover:text-accent/80"
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
        className="flex items-center gap-2 p-4 text-sm text-accent transition-colors hover:bg-surface-raised active:bg-surface"
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
  const pendingFollowUps = useStore((s) => s.pendingFollowUps);
  const thisHistoryKey = conversation.id;
  const isPending = thisHistoryKey in pendingFollowUps;

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

  let displayName: string;
  if (conversation.displayName) {
    displayName = conversation.displayName;
  } else if (conversation.name) {
    displayName = conversation.name;
  } else if (conversation.briefingId && conversation.briefingType) {
    const typeLabel = conversation.briefingType === 'work'
      ? 'Work'
      : conversation.briefingType === 'news'
        ? 'News'
        : conversation.briefingType;
    const dateStr = conversation.briefingGeneratedAt
      ? new Date(conversation.briefingGeneratedAt).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        })
      : '';
    displayName = dateStr ? `${typeLabel} - ${dateStr}` : `${typeLabel} follow-up`;
  } else if (conversation.briefingId) {
    displayName = 'Briefing follow-up';
  } else {
    displayName = 'Chat';
  }

  const avatar = (conversation.avatar ?? displayName.charAt(0).toUpperCase()) || '*';
  const tokenDisplay = conversation.totalTokens != null ? formatTokens(conversation.totalTokens) : 'n/a';

  return (
    <button
      onClick={onSelect}
      className="flex items-center justify-between p-4 text-left transition-colors hover:bg-surface-raised active:bg-surface"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-raised text-base">
          {avatar}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-medium text-primary">{displayName}</span>
          {conversation.tagline ? (
            <span className="truncate text-xs text-muted">{conversation.tagline}</span>
          ) : null}
          <span className="text-xs text-muted">
            {conversation.messageCount} message{conversation.messageCount !== 1 ? 's' : ''}
            <span className="mx-1 text-border">|</span>
            <span className="font-mono">{tokenDisplay}</span>
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {isPending && (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted/30 border-t-accent" />
        )}
        <span className="text-xs text-muted">{timeStr}</span>
      </div>
    </button>
  );
}
