/**
 * Full conversation detail view -- scrollable message history with resume input.
 *
 * Renders all messages using ChatThread components. Includes an input bar
 * at bottom to resume the conversation and a back button to the list.
 * The conversation name in the header is tappable for inline rename.
 *
 * Used by: `app/src/views/ChatsView/ChatsView.tsx` -- when a conversation is selected
 * See also: `app/src/components/ChatThread/` -- shared message rendering
 * See also: `app/src/store/conversationSlice.ts::selectConversation` -- fetches messages
 * See also: `app/src/store/chatsSlice.ts::renameConversation` -- persists name to D1
 * Do NOT: Duplicate ChatBubble -- import from ChatThread/
 */
import { useState, useRef, useEffect } from 'react';
import { useStore } from '@/store';
import { ChatThread, ChatInput } from '@/components/ChatThread';

export function ConversationDetail() {
  const selected = useStore((s) => s.selectedConversation);
  const messages = useStore((s) => s.selectedConversationMessages);
  const loading = useStore((s) => s.selectedConversationLoading);
  const clearSelected = useStore((s) => s.clearSelectedConversation);
  const sendFollowUp = useStore((s) => s.sendFollowUp);
  const pendingFollowUps = useStore((s) => s.pendingFollowUps);
  const error = useStore((s) => s.conversationErrors[selected?.id ?? '']);

  const renameConversation = useStore((s) => s.renameConversation);
  const updateBriefingConversationName = useStore((s) => s.updateBriefingConversationName);

  const [copied, setCopied] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus and select-all when rename input mounts
  useEffect(() => {
    if (isRenaming) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isRenaming]);

  if (!selected) return null;

  // Only show loading indicator for THIS conversation's pending follow-up.
  // Match by conversationId — always the primary history key
  const thisHistoryKey = selected.id;
  const pendingFollowUp = pendingFollowUps[thisHistoryKey];
  const isThisPending = !!pendingFollowUp;

  function handleCopySessionId() {
    if (!selected?.sessionId) return;
    navigator.clipboard.writeText(selected.sessionId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleSend(question: string) {
    if (!selected) return;
    sendFollowUp({
      briefingId: selected.briefingId ?? undefined,
      sessionId: selected.sessionId ?? undefined,
      question,
      conversationId: selected.id,
    });
  }

  function handleNameClick() {
    setRenameValue(selected?.name ?? '');
    setIsRenaming(true);
  }

  const renameInFlight = useRef(false);

  async function commitRename() {
    if (!selected || !isRenaming || renameInFlight.current) return;
    renameInFlight.current = true;
    const trimmed = renameValue.trim();
    setIsRenaming(false);
    if (!trimmed || trimmed === (selected.name ?? '')) {
      renameInFlight.current = false;
      return;
    }
    try {
      await renameConversation({ conversationId: selected.id, name: trimmed });
      updateBriefingConversationName({ conversationId: selected.id, name: trimmed });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      setRenameValue(trimmed);
      setIsRenaming(true);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    } finally {
      renameInFlight.current = false;
    }
  }

  function handleRenameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      void commitRename();
    } else if (e.key === 'Escape') {
      setIsRenaming(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-3 border-b border-border-subtle shrink-0">
        <button
          onClick={clearSelected}
          className="text-sm text-muted hover:text-primary"
        >
          &larr; Back
        </button>
        {isRenaming ? (
          <input
            ref={inputRef}
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={() => void commitRename()}
            onKeyDown={handleRenameKeyDown}
            className="flex-1 text-sm font-medium text-primary bg-transparent border-b border-border-subtle outline-none truncate min-w-0"
            aria-label="Rename conversation"
          />
        ) : (
          <button
            onClick={handleNameClick}
            className="flex-1 text-sm font-medium text-primary truncate text-left hover:opacity-70 transition-opacity min-w-0"
            title="Tap to rename"
          >
            {saved ? '✓' : (selected.name ?? 'Conversation')}
          </button>
        )}
        {/* Copy session ID for `claude --resume <id>` in terminal */}
        {selected.sessionId && (
          <button
            onClick={handleCopySessionId}
            className="text-xs text-muted hover:text-primary transition-colors px-1.5 py-0.5 rounded border border-border-subtle"
            title={`Copy session ID: ${selected.sessionId}`}
          >
            {copied ? 'Copied!' : 'Session ID'}
          </button>
        )}
      </div>

      <ChatThread
        messages={messages}
        showTimestamps={true}
        isLoading={isThisPending}
        loadingStartedAt={pendingFollowUp?.startedAt}
        className="flex-1 p-3"
      />

      {error ? (
        <div className="p-3 text-center text-xs text-muted bg-surface border-t border-border-subtle">
          {error}
        </div>
      ) : (
        <div className="border-t border-border-subtle">
          <ChatInput
            onSubmit={handleSend}
            disabled={isThisPending || loading}
          />
        </div>
      )}
    </div>
  );
}
