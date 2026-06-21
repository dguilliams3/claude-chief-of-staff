/**
 * Chat picker dropdown -- lets users switch between conversations for a briefing.
 *
 * Shows the active conversation name in a single-line bar with a chevron toggle.
 * When expanded, lists all conversations for the briefing with a "+ New Chat" option.
 * Hides dropdown affordance when only one unnamed conversation exists (clean UX).
 *
 * Used by: `app/src/components/FollowUpBar/FollowUpBar.tsx`
 * See also: `app/src/store/conversationSlice.ts` -- briefingConversations, activeConversationId
 * Do NOT: Fetch data directly -- reads from store hydrated by FollowUpBar
 */
import { useState, useRef, useEffect } from 'react';
import { useStore } from '@/store';
import { formatTokens } from '@/components/AppHeader/AppHeader';

export function ChatPicker({ briefingId }: { briefingId: string }) {
  const conversations = useStore((s) => s.briefingConversations);
  const activeId = useStore((s) => s.activeConversationId);
  const setActiveConversation = useStore((s) => s.setActiveConversation);
  const createConversation = useStore((s) => s.createConversation);

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Single unnamed conversation -- show simple label, no dropdown
  const isSingleUnnamed = conversations.length <= 1 && !conversations[0]?.name;
  if (isSingleUnnamed) return null;

  const active = conversations.find((c) => c.id === activeId);
  const activeLabel = active?.name ?? getDefaultName(active?.id, conversations);

  function getDefaultName(id: string | undefined, list: typeof conversations): string {
    if (!id) return 'Chat';
    const idx = list.findIndex((c) => c.id === id);
    return idx >= 0 ? `Chat ${idx + 1}` : 'Chat';
  }

  function handleSelect(convId: string) {
    setActiveConversation(convId);
    setOpen(false);
  }

  async function handleNewChat() {
    try {
      await createConversation(briefingId);
      setOpen(false);
    } catch {
      // Silently fail — dropdown stays open so user can retry.
    }
  }

  return (
    <div ref={ref} className="relative px-4 pt-2">
      {/* Active conversation bar */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-3 py-1.5 rounded-md text-sm bg-surface border border-border-subtle hover:bg-surface-raised transition-colors"
      >
        <span className="text-primary font-medium truncate">{activeLabel}</span>
        <svg
          className={`w-4 h-4 text-muted ml-2 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-4 right-4 bottom-full mb-1 bg-surface border border-border-subtle rounded-md shadow-lg overflow-hidden z-20">
          {conversations.map((conv, idx) => {
            const label = conv.name ?? `Chat ${idx + 1}`;
            const isActive = conv.id === activeId;
            const tokenDisplay = conv.totalTokens != null
              ? formatTokens(conv.totalTokens)
              : '—';
            return (
              <button
                key={conv.id}
                onClick={() => handleSelect(conv.id)}
                className={`
                  flex items-center justify-between w-full px-3 py-2 text-sm text-left
                  hover:bg-surface-raised transition-colors
                  ${isActive ? 'border-l-2 border-accent text-accent' : 'border-l-2 border-transparent text-primary'}
                `}
              >
                <span className="truncate">{label}</span>
                <span className="font-mono text-xs text-muted ml-2 shrink-0">{tokenDisplay}</span>
              </button>
            );
          })}
          <button
            onClick={handleNewChat}
            className="flex items-center w-full px-3 py-2 text-sm text-accent hover:bg-surface-raised transition-colors border-t border-border-subtle"
          >
            + New Chat
          </button>
        </div>
      )}
    </div>
  );
}
