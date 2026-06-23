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
import { useEffect, useState } from 'react';
import { useStore } from '@/store';
import { SurfaceState } from '@/components/SurfaceState';
import { ConversationDetail } from './ConversationDetail';
import type { ConversationListItem } from '@/domain/conversation';
import { formatTokens } from '@/lib/formatTokens';

export function ChatsView() {
  const conversations = useStore((s) => s.conversations);
  const loading = useStore((s) => s.conversationsLoading);
  const conversationsError = useStore((s) => s.conversationsError);
  const selected = useStore((s) => s.selectedConversation);
  const fetchConversations = useStore((s) => s.fetchConversations);
  const selectConversation = useStore((s) => s.selectConversation);
  const createConversation = useStore((s) => s.createConversation);
  const [createConversationError, setCreateConversationError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

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
    if (isCreating) return;
    try {
      setCreateConversationError(null);
      setIsCreating(true);
      const item = await createConversation();
      fetchConversations().catch(() => {});
      selectConversation({ conversation: item });
    } catch {
      setCreateConversationError('Could not start a new chat. Try again.');
    } finally {
      setIsCreating(false);
    }
  }

  if (conversationsError && conversations.length === 0) {
    return (
      <SurfaceState title="Couldn't load chats" message={conversationsError} tone="error">
        <button
          type="button"
          onClick={() => void fetchConversations()}
          className="inline-flex min-h-10 items-center rounded-card bg-accent px-4 py-2 text-sm font-medium text-surface transition-all duration-200 hover:brightness-110"
        >
          Retry
        </button>
      </SurfaceState>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="p-4 text-center">
        <p className="text-sm text-primary">No conversations yet.</p>
        <p className="mb-4 mt-1 text-xs text-muted">Start one to ask a follow-up about a briefing.</p>
        {createConversationError ? (
          <p className="mb-3 text-xs text-severity-flag">{createConversationError}</p>
        ) : null}
        <button
          type="button"
          onClick={handleNewChat}
          disabled={isCreating}
          className="inline-flex items-center gap-1.5 min-h-10 px-3 text-sm text-accent transition-colors hover:text-accent/80 disabled:opacity-50"
        >
          {isCreating ? (
            <>
              <span
                aria-hidden="true"
                className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent/30 border-t-accent"
              />
              Starting
            </>
          ) : (
            '+ New Chat'
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-border-subtle">
      <button
        type="button"
        onClick={handleNewChat}
        disabled={isCreating}
        className="flex items-center gap-1.5 p-4 text-sm text-accent transition-colors hover:bg-surface-raised active:bg-surface disabled:opacity-50"
      >
        {isCreating ? (
          <>
            <span
              aria-hidden="true"
              className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent/30 border-t-accent"
            />
            Starting
          </>
        ) : (
          '+ New Chat'
        )}
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
      type="button"
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
            <span aria-hidden="true" className="mx-1 text-border">|</span>
            <span className="font-mono">{tokenDisplay}</span>
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {isPending && (
          <span
            aria-hidden="true"
            className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted/30 border-t-accent"
          />
        )}
        <span className="text-xs text-muted">{timeStr}</span>
      </div>
    </button>
  );
}
