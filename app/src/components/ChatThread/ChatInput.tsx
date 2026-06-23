/**
 * Chat input form -- text input with send button for submitting messages.
 *
 * Extracted from FollowUpBar for reuse in ConversationDetail.
 * Purely presentational -- calls onSubmit prop, no store access.
 *
 * Used by: `app/src/components/FollowUpBar/FollowUpBar.tsx`
 * Used by: `app/src/views/ChatsView/ConversationDetail.tsx`
 * Do NOT: Import the store -- receive callbacks via props
 */
import { useState, useEffect } from 'react';

interface ChatInputProps {
  onSubmit: (question: string) => void;
  disabled?: boolean;
  /**
   * In-flight state: the previous message is sending and a response is pending.
   * When true the send button shows a calm "Sending..." spinner so the click
   * visibly registered. Distinct from `disabled`, which covers all other
   * not-sendable cases (e.g. an inline error state).
   */
  busy?: boolean;
  placeholder?: string;
  /** Pre-filled question from "Ask about this" — consumed once, then cleared. */
  prefill?: string | null;
  /** Called after prefill is consumed to clear the store state. */
  onPrefillConsumed?: () => void;
}

/**
 * Renders the chat input form with send button.
 *
 * When `prefill` changes to a non-null value, sets the input text immediately
 * and calls `onPrefillConsumed` so the caller can clear the store state.
 * The consumer pattern ensures the prefill is displayed once and not re-applied.
 *
 * @param props.onSubmit - Called with trimmed input when the form is submitted
 * @param props.disabled - Disables the input and send button
 * @param props.busy - Previous message is in flight; send button shows a "Sending..." spinner
 * @param props.placeholder - Input placeholder text
 * @param props.prefill - Pre-filled text from "Ask about this" — consumed once on change
 * @param props.onPrefillConsumed - Callback after prefill text is applied to input
 *
 * Upstream: `app/src/components/FollowUpBar/FollowUpBar.tsx` — primary follow-up input
 * Upstream: `app/src/views/ChatsView/ConversationDetail.tsx` — inline chat input
 * Coupling: `app/src/store/conversationSlice.ts::prefillQuestion` — source of the prefill value
 * Do NOT: Import the store directly — receive all state via props
 */
export function ChatInput({ onSubmit, disabled = false, busy = false, placeholder = 'Ask a follow-up...', prefill, onPrefillConsumed }: ChatInputProps) {
  const [input, setInput] = useState('');

  // Consume prefill when it changes
  useEffect(() => {
    if (prefill) {
      setInput(prefill);
      onPrefillConsumed?.();
    }
  }, [prefill, onPrefillConsumed]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setInput('');
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2.5 p-4">
      <input
        type="text"
        data-followup-input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="
          flex-1 bg-surface text-primary text-sm rounded-input
          px-4 py-2.5
          border border-border-subtle
          placeholder:text-muted/50
          focus:outline-none focus:border-accent/40
          focus:shadow-[0_0_0_3px_rgba(200,121,65,0.08)]
          transition-all duration-200
          font-body
          disabled:opacity-50
        "
      />
      <button
        type="submit"
        disabled={disabled || busy || !input.trim()}
        className="
          inline-flex items-center justify-center gap-1.5
          px-5 py-2.5 rounded-input
          bg-accent/15 text-accent
          border border-accent/25
          text-sm font-medium
          font-mono
          disabled:opacity-30
          hover:bg-accent/25
          transition-all duration-200
        "
      >
        {busy ? (
          <>
            <span
              aria-hidden="true"
              className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent/30 border-t-accent"
            />
            <span>Sending</span>
          </>
        ) : (
          'Send'
        )}
      </button>
    </form>
  );
}
