/**
 * Follow-up conversation bar -- sticky bottom bar with expandable chat history.
 *
 * Orchestrates the follow-up UX: input form, chat bubble history, typing indicator,
 * and drawer expand/collapse behavior. Delegates rendering to shared ChatThread
 * and ChatInput components. Hydrates persisted history on mount. Includes ChatPicker
 * for multi-conversation switching when 2+ conversations exist.
 *
 * Used by: `app/src/components/TodayView/TodayView.tsx`
 * See also: `app/src/store/conversationSlice.ts::sendFollowUp` -- sends question
 * See also: `app/src/components/ChatThread/` -- shared message rendering
 * See also: `app/src/components/FollowUpBar/ChatPicker.tsx` -- conversation switcher
 * Do NOT: Fetch data directly -- store handles the API call and state updates
 */
import { useEffect } from "react";
import { useStore } from "@/store";
import { ChatThread, ChatInput } from "@/components/ChatThread";
import { EMPTY_HISTORY } from "@/domain/conversation/constants";
import { DrawerHandle } from "./DrawerHandle";
import { ChatPicker } from "./ChatPicker";
import { useDrawer } from "./hooks/useDrawer";

/**
 * Sticky bottom bar with expandable chat drawer for follow-up conversations.
 *
 * Orchestrates: input form, chat bubble history, typing/awaiting indicator,
 * drawer expand/collapse, and ChatPicker for multi-conversation switching.
 * Hydrates persisted history from D1 on mount.
 *
 * @param briefingId - Briefing this bar is attached to (keys followUpHistory)
 * @param sessionId - Claude session ID from the briefing (used for resume)
 *
 * Upstream: `app/src/views/TodayView/TodayView.tsx`
 * Downstream: `ChatThread`, `ChatInput`, `ChatPicker`, `DrawerHandle`
 * Downstream: `app/src/store/conversationSlice.ts::sendFollowUp`, `hydrateFollowUpHistory`
 * Do NOT: Fetch data directly — store handles API calls and state updates
 */
export function FollowUpBar({
  briefingId,
  sessionId,
}: {
  briefingId: string;
  sessionId: string;
}) {
  const activeConversationId = useStore((s) => s.activeConversationId);
  // History is keyed by conversationId (not briefingId) to prevent multi-chat collision.
  // Falls back to briefingId only before hydration sets the activeConversationId.
  const historyKey = activeConversationId || briefingId;
  const history = useStore(
    (s) => s.followUpHistory[historyKey] ?? EMPTY_HISTORY,
  );
  const isHydrating = useStore((s) => s.followUpHydrating[briefingId] ?? false);
  const pendingFollowUp = useStore((s) => s.pendingFollowUp);
  const sendFollowUp = useStore((s) => s.sendFollowUp);
  const hydrateFollowUpHistory = useStore((s) => s.hydrateFollowUpHistory);
  const loading =
    !!pendingFollowUp && pendingFollowUp.historyKey === historyKey;
  const prefillQuestion = useStore((s) => s.prefillQuestion);
  const setPrefillQuestion = useStore((s) => s.setPrefillQuestion);

  const { isExpanded, expand, collapse, toggle } = useDrawer();

  useEffect(() => {
    hydrateFollowUpHistory({ briefingId });
  }, [briefingId, hydrateFollowUpHistory]);

  function handleSend(question: string) {
    expand();
    sendFollowUp({
      briefingId,
      sessionId,
      question,
      conversationId: activeConversationId ?? undefined,
    });
  }

  const hasContent = history.length > 0 || loading;

  return (
    <>
      {/* Backdrop overlay when expanded */}
      {isExpanded && (
        <div
          className="fixed inset-0 z-[9] bg-black/40 transition-opacity duration-300"
          onClick={collapse}
        />
      )}

      <div
        className={`
        shrink-0 z-10
        bg-background/80 backdrop-blur-xl
        border-t border-border-subtle
        safe-bottom
        transition-all duration-300 ease-out
      `}
      >
        {/* Drawer handle -- visible when there's history to expand */}
        {hasContent && (
          <DrawerHandle isExpanded={isExpanded} onToggle={toggle} />
        )}

        {/* Chat history -- only visible when expanded */}
        {isExpanded && hasContent && (
          <div className="max-h-[70dvh] overflow-y-auto overscroll-y-contain px-4 pt-2 pb-2">
            {isHydrating && (
              <p className="text-xs text-muted px-2">Loading history...</p>
            )}
            <ChatThread
              messages={history}
              showTimestamps={false}
              isLoading={loading}
              loadingStartedAt={pendingFollowUp?.startedAt}
            />
          </div>
        )}

        <ChatPicker briefingId={briefingId} />
        <ChatInput
          onSubmit={handleSend}
          disabled={loading}
          prefill={prefillQuestion}
          onPrefillConsumed={() => setPrefillQuestion(null)}
        />
      </div>
    </>
  );
}
