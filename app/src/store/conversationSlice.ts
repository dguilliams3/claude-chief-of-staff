/**
 * Zustand conversation slice -- conversation list, selection, hydration, and follow-up state.
 *
 * Merged into the main CosStore via spread in store/index.ts.
 * Handles all conversation-related API calls and state management.
 * Follow-up uses async polling (fire-and-forget + job status) — not blocking HTTP.
 *
 * Cross-slice dependency: this slice reads selectedConversation/conversations and
 * writes selectedConversationMessages/conversationErrors from ChatsSlice. These
 * fields are included in StoreGet/StoreSet explicitly — no unsafe casts.
 *
 * Used by: `app/src/store/index.ts` -- merged via createConversationSlice()
 * See also: `app/src/store/chatsSlice.ts` -- fields this slice reads and writes
 * See also: `app/src/domain/conversation/api.ts` -- HTTP client functions called by this slice
 * See also: `app/src/domain/conversation/types.ts` -- type contracts
 * Do NOT: Call fetch directly -- use api.ts functions
 */
import type { Message, ConversationListItem } from '@/domain/conversation';
import type { FollowUpJobStatus } from '@/domain/conversation';
import { FollowUpError } from '@/domain/conversation/errors';
import { assignConversationName } from '@/domain/conversation/conversation-name';
import {
  sendFollowUp as apiSendFollowUp,
  fetchFollowUpStatus as apiFetchFollowUpStatus,
  fetchConversationMessages as apiFetchMessages,
  fetchConversationByBriefing as apiFetchConversationByBriefing,
  createConversation as apiCreateConversation,
  EMPTY_HISTORY,
  mergeMessages,
} from '@/domain/conversation';
import { pollForResult, stopPolling, stopAllPolling as stopAllActivePolls } from '@/lib/polling';

/** Tracks which briefingId is currently being hydrated. Used to discard stale async responses
 * when the user switches briefings during hydration. Module-level (not store state) to avoid render cycles. */
let currentHydratingBriefingId: string | null = null;

// EMPTY_HISTORY lives in @/domain/conversation/constants — import directly from there


/**
 * Pending follow-up state — carries briefingId for matching and startedAt
 * for the elapsed time counter in TypingIndicator.
 *
 * Coupling: `app/src/components/ChatThread/TypingIndicator.tsx` — reads startedAt
 * Coupling: `app/src/components/FollowUpBar/FollowUpBar.tsx` — reads historyKey for loading state
 * Coupling: `app/src/views/ChatsView/ConversationDetail.tsx` — reads historyKey for loading state
 * Coupling: `app/src/views/ChatsView/ChatsView.tsx` — reads historyKey for spinner
 */
export interface PendingFollowUp {
  /** Key matching the followUpHistory entry — briefingId or conversationId */
  historyKey: string;
  /** Date.now() when the follow-up was sent (drives elapsed counter) */
  startedAt: number;
}

export interface ConversationSlice {
  // Follow-up (keyed by briefingId or conversationId)
  followUpHistory: Record<string, Message[]>;
  pendingFollowUp: PendingFollowUp | null;
  followUpError: string | null;

  // Hydration state (for FollowUpBar)
  followUpHydrating: Record<string, boolean>;

  // Multi-chat state (per-briefing)
  activeConversationId: string | null;
  briefingConversations: ConversationListItem[];

  /** Pre-filled question from "Ask about this" on a section card. Consumed once by ChatInput. */
  prefillQuestion: string | null;

  // Actions
  sendFollowUp: (options: { briefingId?: string; sessionId?: string; question: string; conversationId?: string }) => Promise<void>;
  hydrateFollowUpHistory: (options: { briefingId: string }) => Promise<void>;
  createConversation: (briefingId?: string) => Promise<ConversationListItem>;
  setActiveConversation: (conversationId: string) => Promise<void>;
  fetchBriefingConversations: (briefingId: string) => Promise<void>;
  setPrefillQuestion: (question: string | null) => void;
  /** Updates a conversation name in briefingConversations (syncs rename from ChatsSlice). */
  updateBriefingConversationName: (options: { conversationId: string; name: string }) => void;
}

// mergeMessages imported from @/domain/conversation

/** Re-export stopAllPolling for auth cleanup in store/index.ts */
export { stopAllActivePolls as stopAllPolling };

/**
 * Cross-slice state fields this slice reads from ChatsSlice.
 * Declared explicitly so StoreGet is fully typed — no `as unknown as` casts needed.
 * See also: `app/src/store/chatsSlice.ts::ChatsSlice`
 */
interface ChatsSliceDeps {
  selectedConversation: ConversationListItem | null;
  conversations: ConversationListItem[];
  conversationErrors: Record<string, string>;
  selectedConversationMessages: Message[];
}

type StoreGet = () => ConversationSlice & ChatsSliceDeps;
type StoreSet = (partial: Partial<ConversationSlice & ChatsSliceDeps>) => void;


/**
 * Delivers a completed follow-up response into the store — appends the assistant
 * message to history, assigns the conversation name if Claude provided one, and
 * syncs the active conversation detail view.
 *
 * Extracted from sendFollowUp's onComplete callback to keep sendFollowUp under
 * the 30-statement limit and to use domain functions for naming.
 *
 * @param job - The completed follow-up job status with assistant message
 * @param context - The follow-up context (historyKey, conversationId, briefingId)
 * @param store - Zustand get/set for state reads and writes
 *
 * Upstream: `conversationSlice.ts::sendFollowUp` — called via pollForResult onComplete
 * Downstream: `@/domain/conversation/conversation-name::assignConversationName`
 * Do NOT: Persist chatName to D1 — the Worker already handles this on completion poll
 */
function deliverFollowUpResponse(
  job: FollowUpJobStatus,
  context: { historyKey: string; conversationId?: string; briefingId?: string },
  store: { get: StoreGet; set: StoreSet },
): void {
  const { historyKey, conversationId, briefingId } = context;
  const { get, set } = store;

  // Only clear pendingFollowUp if it matches this historyKey (prevents clobbering
  // a different conversation's pending state during concurrent sends)
  const clearPending = get().pendingFollowUp?.historyKey === historyKey ? { pendingFollowUp: null } : {};

  // Guard: server may return completed without assistantMessage (schema drift, server bug)
  if (!job.assistantMessage) {
    set(clearPending);
    return;
  }

  // Append assistant message to history
  const current = get().followUpHistory[historyKey] ?? [];
  const withAssistant = [...current, job.assistantMessage];
  set({
    followUpHistory: { ...get().followUpHistory, [historyKey]: withAssistant },
    ...clearPending,
  });

  // Assign conversation name if Claude provided one
  if (job.chatName && conversationId) {
    set({ briefingConversations: assignConversationName(get().briefingConversations, conversationId, job.chatName) });
  }

  // Sync selectedConversationMessages for ConversationDetail.
  // selectedConversation and selectedConversationMessages are ChatsSlice fields
  // included in StoreGet/StoreSet via ChatsSliceDeps — no cast needed.
  const selectedConversation = get().selectedConversation;
  if (selectedConversation && (
    (briefingId && selectedConversation.briefingId === briefingId) ||
    (conversationId && selectedConversation.id === conversationId)
  )) {
    set({ selectedConversationMessages: withAssistant });
  }
}

/**
 * Handles errors from the follow-up enqueue call — reconciles optimistic UI
 * based on whether the user message was persisted to D1.
 *
 * @param error - The caught error (FollowUpError or generic)
 * @param context - The follow-up context (historyKey, tempId, sessionId)
 * @param store - Zustand get/set for state reads and writes
 *
 * Upstream: `conversationSlice.ts::sendFollowUp` — catch block
 */
function handleFollowUpError(
  error: unknown,
  context: { historyKey: string; tempId: string; effectiveSessionId?: string },
  store: { get: StoreGet; set: StoreSet },
): void {
  const { historyKey, tempId, effectiveSessionId } = context;
  const { get, set } = store;

  if (error instanceof FollowUpError) {
    set({ followUpError: error.message });

    const current = get().followUpHistory[historyKey] ?? [];
    if (error.persisted && error.userMessage) {
      const updated = current.map(m =>
        m.id === tempId
          ? { ...m, id: error.userMessage!.id, conversationId: error.userMessage!.conversationId, createdAt: error.userMessage!.createdAt }
          : m
      );
      set({ followUpHistory: { ...get().followUpHistory, [historyKey]: updated } });
    } else if (!error.persisted) {
      const updated = current.filter(m => m.id !== tempId);
      set({ followUpHistory: { ...get().followUpHistory, [historyKey]: updated } });
    }

    if (error.sessionExpired) {
      // conversations and conversationErrors are ChatsSlice fields included in
      // StoreGet/StoreSet via ChatsSliceDeps — no cast needed.
      // Try sessionId first, fall back to historyKey (conversationId) for Chats-tab conversations
      // where effectiveSessionId may be undefined.
      const conversation = get().conversations.find(c =>
        (effectiveSessionId && c.sessionId === effectiveSessionId) || c.id === historyKey
      );
      if (conversation) {
        set({
          conversationErrors: { ...get().conversationErrors, [conversation.id]: 'Session expired -- read-only' },
        });
      }
    }
  } else {
    set({ followUpError: 'Something went wrong. Try again.' });
  }
  // Only clear pendingFollowUp if it matches this historyKey
  if (get().pendingFollowUp?.historyKey === historyKey) {
    set({ pendingFollowUp: null });
  }
}

/** Initial conversation data state — used by createConversationSlice and logout reset. */
export const CONVERSATION_INITIAL_STATE: Pick<
  ConversationSlice,
  'followUpHistory' | 'pendingFollowUp' | 'followUpError' | 'followUpHydrating' |
  'activeConversationId' | 'briefingConversations' | 'prefillQuestion'
> = {
  followUpHistory: {},
  pendingFollowUp: null,
  followUpError: null,
  followUpHydrating: {},
  activeConversationId: null,
  briefingConversations: [],
  prefillQuestion: null,
};

/**
 * Creates the conversation slice — follow-up sending/polling, hydration, and multi-chat management.
 *
 * @param set - Zustand set function for partial state updates
 * @param get - Zustand get function for reading current state
 * @returns ConversationSlice with initial state and bound actions
 *
 * Upstream: `app/src/store/index.ts` — merged into CosStore via spread
 * Downstream: `app/src/domain/conversation/api.ts` — all API functions
 * Pattern: STORE-FIRST — actions write to store, components read via selectors
 * Tested by: `app/src/store/conversationSlice.test.ts`
 */
export function createConversationSlice(set: StoreSet, get: StoreGet): ConversationSlice {
  return {
    ...CONVERSATION_INITIAL_STATE,

    /**
     * Sends a follow-up question with optimistic UI and async polling.
     *
     * Flow: optimistic user message → API enqueue (202) → ID reconciliation →
     * adaptive polling via pollForResult → append assistant message on completion.
     *
     * @param options.briefingId - Briefing this conversation belongs to. Omit for standalone chats.
     * @param options.sessionId - Claude session to resume. Omit for new sessions.
     * @param options.question - The user's follow-up question text
     * @param options.conversationId - Conversation ID for multi-chat support
     *
     * Upstream: `app/src/components/FollowUpBar/FollowUpBar.tsx::handleSend`
     * Upstream: `app/src/views/ChatsView/ConversationDetail.tsx::handleSend`
     * Downstream: `app/src/domain/conversation/api.ts::sendFollowUp` (enqueue), `app/src/domain/conversation/api.ts::fetchFollowUpStatus` (poll)
     * Downstream: `app/src/lib/polling/pollForResult.ts` — manages the polling lifecycle
     * Pattern: STORE-FIRST — optimistic add, reconcile with D1 ID, poll for result
     * Do NOT: Skip stopPolling(historyKey) — causes double-poll on rapid sends
     * Do NOT: Call apiUpdateConversationName — Worker persists chatName on completion (M4)
     * Tested by: `app/src/store/conversationSlice.test.ts`
     */
    async sendFollowUp({ briefingId, sessionId, question, conversationId }: {
      briefingId?: string;
      sessionId?: string;
      question: string;
      conversationId?: string;
    }) {
      // Resolve the session ID: try local lookup first, but fall through to let
      // the Worker resolve from D1 if briefingConversations is stale (e.g., tab switch).
      // The Worker's resolveFollowUpContext always does the authoritative D1 lookup.
      let effectiveSessionId = sessionId;
      if (conversationId) {
        const conv = get().briefingConversations.find(c => c.id === conversationId);
        if (conv?.sessionId) effectiveSessionId = conv.sessionId;
        // If not found locally, effectiveSessionId stays as the passed-in sessionId
        // (which may be undefined). The Worker resolves it from D1 via conversationId.
      }

      // History key: use conversationId as primary key (unique per conversation).
      // Falls back to briefingId only for legacy single-chat flows without a conversationId.
      // Do NOT: Key by briefingId when conversationId exists — that collapses
      // all conversations under one briefing into a shared message array (Codex CRITICAL).
      const historyKey = conversationId || briefingId || '';

      // Guard: both IDs missing means we can't key the history or poll correctly.
      if (!historyKey) {
        set({ followUpError: 'Cannot send follow-up: missing conversationId or briefingId' });
        return;
      }

      // Guard: reject if THIS conversation already has a pending follow-up.
      // Scoped to historyKey so other conversations can still send.
      const currentPending = get().pendingFollowUp;
      if (currentPending && currentPending.historyKey === historyKey) {
        return;
      }

      // 1. Optimistic add -- user sees question immediately
      const tempId = `temp-${Date.now()}`;
      const optimisticMessage: Message = {
        id: tempId,
        conversationId: conversationId ?? '',
        role: 'user',
        content: question,
        createdAt: new Date().toISOString(),
      };
      const history = get().followUpHistory[historyKey] ?? [];
      const startedAt = Date.now();
      set({
        followUpHistory: { ...get().followUpHistory, [historyKey]: [...history, optimisticMessage] },
        pendingFollowUp: { historyKey, startedAt },
        followUpError: null,
      });

      // Stop any existing poll for this same history key (prevents double-poll on rapid sends)
      stopPolling(historyKey);

      try {
        // 2. Send follow-up — returns instantly with jobId (202)
        const res = await apiSendFollowUp({ briefingId, sessionId: effectiveSessionId ?? undefined, question, conversationId });

        // 3. Reconcile user message: swap temp ID with D1 ID
        const current = get().followUpHistory[historyKey] ?? [];
        let updated = current;

        if (res.userMessage) {
          updated = updated.map(m =>
            m.id === tempId
              ? { ...m, id: res.userMessage!.id, conversationId: res.userMessage!.conversationId, createdAt: res.userMessage!.createdAt }
              : m
          );
          set({ followUpHistory: { ...get().followUpHistory, [historyKey]: updated } });
        }

        // 4. Start adaptive polling for the response
        pollForResult<FollowUpJobStatus>(
          { pollKey: historyKey, startedAt },
          {
            onComplete(job) {
              deliverFollowUpResponse(job, { historyKey, conversationId, briefingId }, { get, set });
            },
            onFailed(error) {
              const clearPending = get().pendingFollowUp?.historyKey === historyKey ? { pendingFollowUp: null } : {};
              set({ followUpError: error, ...clearPending });
            },
            onTimeout() {
              // Try recovering from D1 — the push-on-completion may have persisted
              // the assistant message even though our direct poll timed out.
              if (conversationId) {
                apiFetchMessages({ conversationId }).then(msgs => {
                  if (msgs.length > 0 && msgs[msgs.length - 1].role === 'assistant') {
                    // Recovery success: D1 has the assistant message
                    const clearPendingOnRecovery = get().pendingFollowUp?.historyKey === historyKey ? { pendingFollowUp: null } : {};
                    set({
                      followUpHistory: { ...get().followUpHistory, [historyKey]: msgs },
                      ...clearPendingOnRecovery,
                    });
                  } else {
                    set({
                      followUpError: 'Response timed out. Claude may still be working — check back later.',
                      ...(get().pendingFollowUp?.historyKey === historyKey ? { pendingFollowUp: null } : {}),
                    });
                  }
                }).catch(() => {
                  set({
                    followUpError: 'Response timed out. Claude may still be working — check back later.',
                    ...(get().pendingFollowUp?.historyKey === historyKey ? { pendingFollowUp: null } : {}),
                  });
                });
              } else {
                set({
                  followUpError: 'Response timed out. Claude may still be working — check back later.',
                  ...(get().pendingFollowUp?.historyKey === historyKey ? { pendingFollowUp: null } : {}),
                });
              }
            },
            onTerminalError(error) {
              const clearPending = get().pendingFollowUp?.historyKey === historyKey ? { pendingFollowUp: null } : {};
              set({ followUpError: error, ...clearPending });
            },
          },
          // fetchStatus: the HTTP call that polls for the job result.
          // The signal comes from the polling lifecycle AbortController — forwarded
          // to fetch() so the request is cancelled when stopPolling() is called.
          (signal) => apiFetchFollowUpStatus({
            jobId: res.jobId,
            conversationId: res.conversationId,
            briefingId: res.briefingId,
            isNewSession: res.isNewSession,
            signal,
          }),
        );

      } catch (error) {
        handleFollowUpError(error, { historyKey, tempId, effectiveSessionId }, { get, set });
      }
    },

    async hydrateFollowUpHistory({ briefingId }: { briefingId: string }) {
      // Guard: prevent concurrent hydration for the same briefing
      if (get().followUpHydrating[briefingId]) return;

      // Track which briefing we're hydrating. After each async operation, check
      // if the user switched briefings — if so, discard the stale response.
      // This uses a module-level variable (not store state) to avoid render cycles.
      currentHydratingBriefingId = briefingId;

      set({ followUpHydrating: { ...get().followUpHydrating, [briefingId]: true } });

      try {
        const conversationListItems = await apiFetchConversationByBriefing({ briefingId });

        // Stale check: user may have switched briefings during the async fetch
        if (currentHydratingBriefingId !== briefingId) {
          set({ followUpHydrating: { ...get().followUpHydrating, [briefingId]: false } });
          return;
        }

        // Atomic swap — replace previous briefing's conversations in one set() call
        set({
          briefingConversations: conversationListItems,
          activeConversationId: conversationListItems.length > 0 ? conversationListItems[0].id : null,
        });

        if (conversationListItems.length === 0) {
          set({ followUpHydrating: { ...get().followUpHydrating, [briefingId]: false } });
          return;
        }

        // Load messages for the active conversation
        const activeConversation = conversationListItems[0];
        const conversationHistoryKey = activeConversation.id;
        const messages = await apiFetchMessages({ conversationId: activeConversation.id });

        // Stale check again after second async operation
        if (currentHydratingBriefingId !== briefingId) {
          set({ followUpHydrating: { ...get().followUpHydrating, [briefingId]: false } });
          return;
        }

        const existing = get().followUpHistory[conversationHistoryKey] ?? [];
        const merged = mergeMessages(messages, existing);

        set({
          followUpHistory: { ...get().followUpHistory, [conversationHistoryKey]: merged.length > 0 ? merged : EMPTY_HISTORY },
          followUpHydrating: { ...get().followUpHydrating, [briefingId]: false },
        });
        currentHydratingBriefingId = null;
      } catch (error) {
        console.error('[COS] Follow-up hydration failed for briefing', briefingId, error);
        set({ followUpHydrating: { ...get().followUpHydrating, [briefingId]: false } });
        currentHydratingBriefingId = null;
      }
    },

    async createConversation(briefingId?: string): Promise<ConversationListItem> {
      const item = await apiCreateConversation({ briefingId });
      set({
        briefingConversations: [...get().briefingConversations, item],
        activeConversationId: item.id,
      });
      return item;
    },

    async setActiveConversation(conversationId: string) {
      set({ activeConversationId: conversationId });

      // Load messages for this conversation into followUpHistory
      try {
        const messages = await apiFetchMessages({ conversationId });
        // Key by conversationId (primary key, unique per conversation)
        const historyKey = conversationId;
        set({
          followUpHistory: {
            ...get().followUpHistory,
            [historyKey]: messages.length > 0 ? messages : EMPTY_HISTORY,
          },
        });
      } catch (err) {
        console.error('[COS] Failed to load messages for conversation', conversationId, err);
      }
    },

    async fetchBriefingConversations(briefingId: string) {
      try {
        const convListItems = await apiFetchConversationByBriefing({ briefingId });
        set({ briefingConversations: convListItems });
        if (convListItems.length > 0 && !get().activeConversationId) {
          set({ activeConversationId: convListItems[0].id });
        }
      } catch (err) {
        console.error('[COS] Failed to fetch briefing conversations', briefingId, err);
      }
    },

    /**
     * Sets or clears the prefill question for the next ChatInput render.
     *
     * Called by the "Ask about this" button in SectionCard. ChatInput consumes
     * the value and calls setPrefillQuestion(null) via onPrefillConsumed to clear it.
     *
     * @param question - The prefill text, or null to clear
     *
     * Upstream: `app/src/components/SectionCard/SectionCard.tsx` — "Ask about this" button
     * Downstream: `app/src/components/ChatThread/ChatInput.tsx` — reads as `prefill` prop
     */
    setPrefillQuestion(question: string | null) {
      set({ prefillQuestion: question });
    },

    updateBriefingConversationName({ conversationId, name }: { conversationId: string; name: string }) {
      set({
        briefingConversations: get().briefingConversations.map(conversation =>
          conversation.id === conversationId ? { ...conversation, name } : conversation
        ),
      });
    },

  };
}
