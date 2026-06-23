/**
 * Full conversation detail view -- scrollable message history with resume input.
 *
 * Renders all messages using ChatThread components. Includes an input bar
 * at bottom to resume the conversation and a back button to the list.
 * The citizen identity in the header is editable inline.
 *
 * Used by: `app/src/views/ChatsView/ChatsView.tsx` -- when a conversation is selected
 * See also: `app/src/components/ChatThread/` -- shared message rendering
 * See also: `app/src/store/conversationSlice.ts::selectConversation` -- fetches messages
 * See also: `app/src/store/chatsSlice.ts::updateConversationIdentity` -- persists identity fields
 * Do NOT: Duplicate ChatBubble -- import from ChatThread/
 */
import { useState, useRef, useEffect } from 'react';
import { useStore } from '@/store';
import { SurfaceState } from '@/components/SurfaceState';
import { ChatThread, ChatInput } from '@/components/ChatThread';

export function ConversationDetail() {
  const selected = useStore((s) => s.selectedConversation);
  const messages = useStore((s) => s.selectedConversationMessages);
  const loading = useStore((s) => s.selectedConversationLoading);
  const selectedConversationError = useStore((s) => s.selectedConversationError);
  const clearSelected = useStore((s) => s.clearSelectedConversation);
  const refreshSelectedConversation = useStore((s) => s.refreshSelectedConversation);
  const sendFollowUp = useStore((s) => s.sendFollowUp);
  const pendingFollowUps = useStore((s) => s.pendingFollowUps);
  const error = useStore((s) => s.conversationErrors[selected?.id ?? '']);
  const updateConversationIdentity = useStore((s) => s.updateConversationIdentity);
  const updateBriefingConversationIdentity = useStore((s) => s.updateBriefingConversationIdentity);

  const [copied, setCopied] = useState(false);
  const [isEditingIdentity, setIsEditingIdentity] = useState(false);
  const [displayNameValue, setDisplayNameValue] = useState('');
  const [taglineValue, setTaglineValue] = useState('');
  const [avatarValue, setAvatarValue] = useState('');
  const [saved, setSaved] = useState(false);
  const displayNameInputRef = useRef<HTMLInputElement>(null);
  const identitySaveInFlight = useRef(false);

  useEffect(() => {
    if (isEditingIdentity) {
      displayNameInputRef.current?.focus();
      displayNameInputRef.current?.select();
    }
  }, [isEditingIdentity]);

  if (!selected) return null;
  const conversation = selected;

  const thisHistoryKey = conversation.id;
  const pendingFollowUp = pendingFollowUps[thisHistoryKey];
  const isThisPending = !!pendingFollowUp;
  const headerDisplayName = conversation.displayName ?? conversation.name ?? 'Conversation';
  const headerAvatar = (conversation.avatar ?? headerDisplayName.charAt(0).toUpperCase()) || '*';

  function handleCopySessionId() {
    if (!conversation.sessionId) return;
    navigator.clipboard.writeText(conversation.sessionId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleSend(question: string) {
    sendFollowUp({
      briefingId: conversation.briefingId ?? undefined,
      sessionId: conversation.sessionId ?? undefined,
      question,
      conversationId: conversation.id,
    });
  }

  function handleIdentityClick() {
    setDisplayNameValue(conversation.displayName ?? '');
    setTaglineValue(conversation.tagline ?? '');
    setAvatarValue(conversation.avatar ?? '');
    setIsEditingIdentity(true);
  }

  async function commitIdentity() {
    if (!selected || !isEditingIdentity || identitySaveInFlight.current) return;
    identitySaveInFlight.current = true;

    const identity = {
      displayName: displayNameValue.trim() || null,
      tagline: taglineValue.trim() || null,
      avatar: avatarValue.trim() || null,
    };
    const identityChanged =
      identity.displayName !== (conversation.displayName ?? null) ||
      identity.tagline !== (conversation.tagline ?? null) ||
      identity.avatar !== (conversation.avatar ?? null);

    setIsEditingIdentity(false);
    if (!identityChanged) {
      identitySaveInFlight.current = false;
      return;
    }

    try {
      await updateConversationIdentity({ conversationId: conversation.id, identity });
      updateBriefingConversationIdentity({ conversationId: conversation.id, identity });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      setIsEditingIdentity(true);
      requestAnimationFrame(() => {
        displayNameInputRef.current?.focus();
        displayNameInputRef.current?.select();
      });
    } finally {
      identitySaveInFlight.current = false;
    }
  }

  function handleIdentityKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      void commitIdentity();
    } else if (e.key === 'Escape') {
      setIsEditingIdentity(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 border-b border-border-subtle p-3 shrink-0">
        <button
          type="button"
          onClick={clearSelected}
          className="inline-flex items-center min-h-10 px-1 -ml-1 text-sm text-muted hover:text-primary transition-colors"
        >
          <span aria-hidden="true" className="mr-1">
            &larr;
          </span>
          Back
        </button>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-raised text-base">
          {headerAvatar}
        </span>
        {isEditingIdentity ? (
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <input
              ref={displayNameInputRef}
              type="text"
              value={displayNameValue}
              onChange={(e) => setDisplayNameValue(e.target.value)}
              onBlur={() => void commitIdentity()}
              onKeyDown={handleIdentityKeyDown}
              className="min-w-0 border-b border-border-subtle bg-transparent text-sm font-medium text-primary focus:border-accent"
              aria-label="Citizen display name"
              placeholder="Citizen name"
            />
            <input
              type="text"
              value={taglineValue}
              onChange={(e) => setTaglineValue(e.target.value)}
              onBlur={() => void commitIdentity()}
              onKeyDown={handleIdentityKeyDown}
              className="min-w-0 border-b border-border-subtle bg-transparent text-xs text-muted focus:border-accent"
              aria-label="Citizen tagline"
              placeholder="Tagline"
            />
            <input
              type="text"
              value={avatarValue}
              onChange={(e) => setAvatarValue(e.target.value)}
              onBlur={() => void commitIdentity()}
              onKeyDown={handleIdentityKeyDown}
              className="min-w-0 border-b border-border-subtle bg-transparent text-xs text-muted focus:border-accent"
              aria-label="Citizen avatar"
              placeholder="e.g. 🤖"
            />
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 flex-col">
            <button
              type="button"
              onClick={handleIdentityClick}
              className="truncate text-left text-sm font-medium text-primary transition-opacity hover:opacity-70"
              title="Edit citizen identity"
            >
              {saved ? 'Saved' : headerDisplayName}
            </button>
            {conversation.tagline ? (
              <span className="truncate text-xs text-muted">{conversation.tagline}</span>
            ) : null}
          </div>
        )}
        {conversation.sessionId && (
          <button
            type="button"
            onClick={handleCopySessionId}
            className="shrink-0 inline-flex items-center rounded border border-border-subtle px-2 min-h-10 text-xs text-muted transition-colors hover:text-primary"
            title={`Copy session ID: ${conversation.sessionId}`}
          >
            {copied ? 'Copied!' : 'Session ID'}
          </button>
        )}
      </div>

      {selectedConversationError && messages.length === 0 ? (
        <SurfaceState
          title="Couldn't load this chat"
          message={selectedConversationError}
          tone="error"
        >
          <button
            type="button"
            onClick={() => void refreshSelectedConversation()}
            className="inline-flex min-h-10 items-center rounded-card bg-accent px-4 py-2 text-sm font-medium text-surface transition-all duration-200 hover:brightness-110"
          >
            Retry
          </button>
        </SurfaceState>
      ) : (
        <ChatThread
          messages={messages}
          showTimestamps={true}
          isLoading={isThisPending}
          loadingStartedAt={pendingFollowUp?.startedAt}
          className="flex-1 p-3"
        />
      )}

      {error ? (
        <div className="border-t border-border-subtle bg-surface p-3 text-center text-xs text-muted">
          {error}
        </div>
      ) : (
        <div className="border-t border-border-subtle">
          <ChatInput onSubmit={handleSend} disabled={isThisPending || loading} busy={isThisPending} />
        </div>
      )}
    </div>
  );
}
