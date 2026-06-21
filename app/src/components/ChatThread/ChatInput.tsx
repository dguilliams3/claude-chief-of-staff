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
 * @param props.placeholder - Input placeholder text
 * @param props.prefill - Pre-filled text from "Ask about this" — consumed once on change
 * @param props.onPrefillConsumed - Callback after prefill text is applied to input
 *
 * Upstream: `app/src/components/FollowUpBar/FollowUpBar.tsx` — primary follow-up input
 * Upstream: `app/src/views/ChatsView/ConversationDetail.tsx` — inline chat input
 * Coupling: `app/src/store/conversationSlice.ts::prefillQuestion` — source of the prefill value
 * Do NOT: Import the store directly — receive all state via props
 */
export function ChatInput({ onSubmit, disabled = false, placeholder = 'Ask a follow-up...', prefill, onPrefillConsumed }: ChatInputProps) {
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
        disabled={disabled || !input.trim()}
        className="
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
        Send
      </button>
    </form>
  );
}
