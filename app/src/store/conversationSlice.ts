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
import type { Message, ConversationListItem } from "@/domain/conversation";
import type { FollowUpJobStatus } from "@/domain/conversation";
import { FollowUpError } from "@/domain/conversation/errors";
import { assignConversationName } from "@/domain/conversation/conversation-name";
import {
  sendFollowUp,
  fetchFollowUpStatus,
  fetchConversationMessages,
  fetchConversationByBriefing,
  createConversation,
  EMPTY_HISTORY,
  mergeMessages,
} from "@/domain/conversation";
import { pollForResult, stopPolling, stopAllPolling } from "@/lib/polling";
import { toast } from "@/lib/toast";

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
  pendingFollowUps: Record<string, PendingFollowUp>;
  followUpError: string | null;

  // Hydration state (for FollowUpBar)
  followUpHydrating: Record<string, boolean>;

  // Multi-chat state (per-briefing)
  activeConversationId: string | null;
  briefingConversations: ConversationListItem[];

  /** Pre-filled question from "Ask about this" on a section card. Consumed once by ChatInput. */
  prefillQuestion: string | null;

  // Actions
  sendFollowUp: (options: {
    briefingId?: string;
    sessionId?: string;
    question: string;
    conversationId?: string;
  }) => Promise<void>;
  hydrateFollowUpHistory: (options: { briefingId: string }) => Promise<void>;
  createConversation: (briefingId?: string) => Promise<ConversationListItem>;
  setActiveConversation: (conversationId: string) => Promise<void>;
  fetchBriefingConversations: (briefingId: string) => Promise<void>;
  setPrefillQuestion: (question: string | null) => void;
  /** Updates a conversation name in briefingConversations (syncs rename from ChatsSlice). */
  updateBriefingConversationName: (options: {
    conversationId: string;
    name: string;
  }) => void;
  /** Updates user-curated citizen identity fields in briefingConversations. */
  updateBriefingConversationIdentity: (options: {
    conversationId: string;
    identity: {
      displayName?: string | null;
      tagline?: string | null;
      avatar?: string | null;
    };
  }) => void;
}

// mergeMessages imported from @/domain/conversation

/** Re-export stopAllPolling for auth cleanup in store/index.ts */
export { stopAllPolling };

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

interface SliceStore {
  get: StoreGet;
  set: StoreSet;
}

/**
 * Syncs followUpHistory changes to selectedConversationMessages when the
 * currently-selected conversation matches the mutation context.
 */
function syncSelectedMessages(
  messages: Message[],
  context: { briefingId?: string; conversationId?: string },
  store: { get: StoreGet; set: StoreSet },
): void {
  const selected = store.get().selectedConversation;
  if (!selected) return;
  if (
    (context.conversationId && selected.id === context.conversationId) ||
    (context.briefingId && selected.briefingId === context.briefingId)
  ) {
    store.set({ selectedConversationMessages: messages });
  }
}

/** Remove a pending entry by historyKey, returning the updated record for set(). */
function clearPending(
  get: () => { pendingFollowUps: Record<string, PendingFollowUp> },
  historyKey: string,
) {
  const rest = { ...get().pendingFollowUps };
  delete rest[historyKey];
  return { pendingFollowUps: rest };
}

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

  // Clear this conversation's pending state (keyed by historyKey).
  // Other conversations' pending states are unaffected.
  const pendingClear = clearPending(get, historyKey);

  // Guard: server may return completed without assistantMessage (schema drift, server bug)
  if (!job.assistantMessage) {
    set(pendingClear);
    return;
  }

  // Append assistant message to history
  const current = get().followUpHistory[historyKey] ?? [];
  const withAssistant = [...current, job.assistantMessage];
  set({
    followUpHistory: { ...get().followUpHistory, [historyKey]: withAssistant },
    ...pendingClear,
  });

  // Assign conversation name if Claude provided one
  if (job.chatName && conversationId) {
    set({
      briefingConversations: assignConversationName(
        get().briefingConversations,
        conversationId,
        job.chatName,
      ),
    });
  }

  // Sync to ConversationDetail (selectedConversationMessages)
  syncSelectedMessages(
    withAssistant,
    { briefingId, conversationId },
    { get, set },
  );
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
  context: {
    historyKey: string;
    tempId: string;
    effectiveSessionId?: string;
    briefingId?: string;
    conversationId?: string;
  },
  store: { get: StoreGet; set: StoreSet },
): void {
  const { historyKey, tempId, effectiveSessionId, briefingId, conversationId } =
    context;
  const { get, set } = store;

  if (error instanceof FollowUpError) {
    set({ followUpError: error.message });
    toast(error.message, "error");

    const current = get().followUpHistory[historyKey] ?? [];
    if (error.persisted && error.userMessage) {
      const updated = current.map((m) =>
        m.id === tempId
          ? {
              ...m,
              id: error.userMessage!.id,
              conversationId: error.userMessage!.conversationId,
              createdAt: error.userMessage!.createdAt,
            }
          : m,
      );
      set({
        followUpHistory: { ...get().followUpHistory, [historyKey]: updated },
      });
      syncSelectedMessages(updated, { briefingId, conversationId }, store);
    } else if (!error.persisted) {
      const updated = current.filter((m) => m.id !== tempId);
      set({
        followUpHistory: { ...get().followUpHistory, [historyKey]: updated },
      });
      syncSelectedMessages(updated, { briefingId, conversationId }, store);
    }

    if (error.sessionExpired) {
      // conversations and conversationErrors are ChatsSlice fields included in
      // StoreGet/StoreSet via ChatsSliceDeps — no cast needed.
      // Try sessionId first, fall back to historyKey (conversationId) for Chats-tab conversations
      // where effectiveSessionId may be undefined.
      const conversation = get().conversations.find(
        (c) =>
          (effectiveSessionId && c.sessionId === effectiveSessionId) ||
          c.id === historyKey,
      );
      if (conversation) {
        set({
          conversationErrors: {
            ...get().conversationErrors,
            [conversation.id]: "Session expired -- read-only",
          },
        });
      }
    }
  } else {
    set({ followUpError: "Something went wrong. Try again." });
    toast("Something went wrong. Try again.", "error");
  }
  // Clear this conversation's pending entry (keyed by historyKey)
  set(clearPending(get, historyKey));
}

/** Initial conversation data state — used by createConversationSlice and logout reset. */
export const CONVERSATION_INITIAL_STATE: Pick<
  ConversationSlice,
  | "followUpHistory"
  | "pendingFollowUps"
  | "followUpError"
  | "followUpHydrating"
  | "activeConversationId"
  | "briefingConversations"
  | "prefillQuestion"
> = {
  followUpHistory: {},
  pendingFollowUps: {},
  followUpError: null,
  followUpHydrating: {},
  activeConversationId: null,
  briefingConversations: [],
  prefillQuestion: null,
};

/**
 * Builds the follow-up sender action with optimistic UI and adaptive polling.
 *
 * Upstream: `app/src/store/conversationSlice.ts::createConversationSlice`
 * Downstream: `app/src/domain/conversation/api.ts::sendFollowUp`
 * Downstream: `app/src/lib/polling/pollForResult.ts`
 * Do NOT: Inline this back into `createConversationSlice` — the public code standards gate
 * keeps large store wrapper functions small by lifting behavior into named helpers.
 */
function createSendFollowUp({ get, set }: SliceStore): ConversationSlice["sendFollowUp"] {
  return async ({
    briefingId,
    sessionId,
    question,
    conversationId,
  }: {
    briefingId?: string;
    sessionId?: string;
    question: string;
    conversationId?: string;
  }) => {
    let effectiveSessionId = sessionId;
    if (conversationId) {
      const conv = get().briefingConversations.find((c) => c.id === conversationId);
      if (conv?.sessionId) effectiveSessionId = conv.sessionId;
    }

    const historyKey = conversationId || briefingId || "";
    if (!historyKey) {
      set({
        followUpError: "Cannot send follow-up: missing conversationId or briefingId",
      });
      return;
    }

    if (historyKey in get().pendingFollowUps) {
      return;
    }

    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: Message = {
      id: tempId,
      conversationId: conversationId ?? "",
      role: "user",
      content: question,
      createdAt: new Date().toISOString(),
    };
    const history = get().followUpHistory[historyKey] ?? [];
    const startedAt = Date.now();
    set({
      followUpHistory: {
        ...get().followUpHistory,
        [historyKey]: [...history, optimisticMessage],
      },
      pendingFollowUps: {
        ...get().pendingFollowUps,
        [historyKey]: { historyKey, startedAt },
      },
      followUpError: null,
    });

    syncSelectedMessages(
      [...history, optimisticMessage],
      { briefingId, conversationId },
      { get, set },
    );

    stopPolling(historyKey);

    try {
      const res = await sendFollowUp({
        briefingId,
        sessionId: effectiveSessionId ?? undefined,
        question,
        conversationId,
      });

      const current = get().followUpHistory[historyKey] ?? [];
      let updated = current;

      if (res.userMessage) {
        updated = updated.map((m) =>
          m.id === tempId
            ? {
                ...m,
                id: res.userMessage!.id,
                conversationId: res.userMessage!.conversationId,
                createdAt: res.userMessage!.createdAt,
              }
            : m,
        );
        set({
          followUpHistory: {
            ...get().followUpHistory,
            [historyKey]: updated,
          },
        });
        syncSelectedMessages(updated, { briefingId, conversationId }, { get, set });
      }

      pollForResult<FollowUpJobStatus>(
        { pollKey: historyKey, startedAt },
        {
          onComplete(job) {
            deliverFollowUpResponse(job, { historyKey, conversationId, briefingId }, { get, set });
          },
          onFailed(error) {
            set({ followUpError: error, ...clearPending(get, historyKey) });
            toast(error, "error");
          },
          onTimeout() {
            const timeoutMessage =
              "Response timed out. Claude may still be working — check back later.";
            if (conversationId) {
              fetchConversationMessages({ conversationId })
                .then((msgs) => {
                  if (msgs.length > 0 && msgs[msgs.length - 1].role === "assistant") {
                    set({
                      followUpHistory: {
                        ...get().followUpHistory,
                        [historyKey]: msgs,
                      },
                      ...clearPending(get, historyKey),
                    });
                    syncSelectedMessages(msgs, { briefingId, conversationId }, { get, set });
                    return;
                  }
                  set({
                    followUpError: timeoutMessage,
                    ...clearPending(get, historyKey),
                  });
                  toast(timeoutMessage, "warn");
                })
                .catch(() => {
                  set({
                    followUpError: timeoutMessage,
                    ...clearPending(get, historyKey),
                  });
                  toast(timeoutMessage, "warn");
                });
              return;
            }

            set({
              followUpError: timeoutMessage,
              ...clearPending(get, historyKey),
            });
            toast(timeoutMessage, "warn");
          },
          onTerminalError(error) {
            set({ followUpError: error, ...clearPending(get, historyKey) });
            toast(error, "error");
          },
        },
        (signal) =>
          fetchFollowUpStatus({
            jobId: res.jobId,
            conversationId: res.conversationId,
            briefingId: res.briefingId,
            isNewSession: res.isNewSession,
            signal,
          }),
      );
    } catch (error) {
      handleFollowUpError(
        error,
        {
          historyKey,
          tempId,
          effectiveSessionId,
          briefingId,
          conversationId,
        },
        { get, set },
      );
    }
  };
}

/**
 * Builds the history hydrator for briefing follow-up conversations.
 *
 * Upstream: `app/src/store/conversationSlice.ts::createConversationSlice`
 * Downstream: `app/src/domain/conversation/api.ts::fetchConversationByBriefing`
 * Downstream: `app/src/domain/conversation/api.ts::fetchConversationMessages`
 */
function createHydrateFollowUpHistory(
  { get, set }: SliceStore,
): ConversationSlice["hydrateFollowUpHistory"] {
  return async function hydrateFollowUpHistory({ briefingId }: { briefingId: string }) {
    if (get().followUpHydrating[briefingId]) return;

    currentHydratingBriefingId = briefingId;
    set({
      followUpHydrating: { ...get().followUpHydrating, [briefingId]: true },
    });

    try {
      const conversationListItems = await fetchConversationByBriefing({ briefingId });
      if (currentHydratingBriefingId !== briefingId) {
        set({
          followUpHydrating: { ...get().followUpHydrating, [briefingId]: false },
        });
        return;
      }

      set({
        briefingConversations: conversationListItems,
        activeConversationId: conversationListItems.length > 0 ? conversationListItems[0].id : null,
      });

      if (conversationListItems.length === 0) {
        set({
          followUpHydrating: { ...get().followUpHydrating, [briefingId]: false },
        });
        return;
      }

      const activeConversation = conversationListItems[0];
      const conversationHistoryKey = activeConversation.id;
      const messages = await fetchConversationMessages({ conversationId: activeConversation.id });
      if (currentHydratingBriefingId !== briefingId) {
        set({
          followUpHydrating: { ...get().followUpHydrating, [briefingId]: false },
        });
        return;
      }

      const existing = get().followUpHistory[conversationHistoryKey] ?? [];
      const merged = mergeMessages(messages, existing);

      set({
        followUpHistory: {
          ...get().followUpHistory,
          [conversationHistoryKey]: merged.length > 0 ? merged : EMPTY_HISTORY,
        },
        followUpHydrating: { ...get().followUpHydrating, [briefingId]: false },
      });
      currentHydratingBriefingId = null;
    } catch (error) {
      console.error("[COS] Follow-up hydration failed for briefing", briefingId, error);
      set({
        followUpHydrating: { ...get().followUpHydrating, [briefingId]: false },
      });
      currentHydratingBriefingId = null;
    }
  };
}

function createConversationAction({ get, set }: SliceStore): ConversationSlice["createConversation"] {
  return async (briefingId?: string): Promise<ConversationListItem> => {
    const item = await createConversation({ briefingId });
    set({
      briefingConversations: [...get().briefingConversations, item],
      activeConversationId: item.id,
    });
    return item;
  };
}

function createSetActiveConversation(
  { get, set }: SliceStore,
): ConversationSlice["setActiveConversation"] {
  return async (conversationId: string) => {
    set({ activeConversationId: conversationId });

    try {
      const messages = await fetchConversationMessages({ conversationId });
      const historyKey = conversationId;
      set({
        followUpHistory: {
          ...get().followUpHistory,
          [historyKey]: messages.length > 0 ? messages : EMPTY_HISTORY,
        },
      });
    } catch (error) {
      console.error("[COS] Failed to load messages for conversation", conversationId, error);
    }
  };
}

function createFetchBriefingConversations(
  { get, set }: SliceStore,
): ConversationSlice["fetchBriefingConversations"] {
  return async (briefingId: string) => {
    try {
      const convListItems = await fetchConversationByBriefing({ briefingId });
      set({ briefingConversations: convListItems });
      if (convListItems.length > 0 && !get().activeConversationId) {
        set({ activeConversationId: convListItems[0].id });
      }
    } catch (error) {
      console.error("[COS] Failed to fetch briefing conversations", briefingId, error);
    }
  };
}

function createSetPrefillQuestion({ set }: SliceStore): ConversationSlice["setPrefillQuestion"] {
  return function setPrefillQuestion(question: string | null) {
    set({ prefillQuestion: question });
  };
}

function createUpdateBriefingConversationName(
  { get, set }: SliceStore,
): ConversationSlice["updateBriefingConversationName"] {
  return function updateBriefingConversationName({
    conversationId,
    name,
  }: {
    conversationId: string;
    name: string;
  }) {
    set({
      briefingConversations: get().briefingConversations.map((conversation) =>
        conversation.id === conversationId ? { ...conversation, name } : conversation,
      ),
    });
  };
}

function createUpdateBriefingConversationIdentity(
  { get, set }: SliceStore,
): ConversationSlice["updateBriefingConversationIdentity"] {
  return function updateBriefingConversationIdentity({
    conversationId,
    identity,
  }: {
    conversationId: string;
    identity: {
      displayName?: string | null;
      tagline?: string | null;
      avatar?: string | null;
    };
  }) {
    set({
      briefingConversations: get().briefingConversations.map((conversation) =>
        conversation.id === conversationId
          ? {
              ...conversation,
              displayName: identity.displayName ?? null,
              tagline: identity.tagline ?? null,
              avatar: identity.avatar ?? null,
            }
          : conversation,
      ),
    });
  };
}

/**
 * Creates the conversation slice ? follow-up sending/polling, hydration, and multi-chat management.
 *
 * @param set - Zustand set function for partial state updates
 * @param get - Zustand get function for reading current state
 * @returns ConversationSlice with initial state and bound actions
 *
 * Upstream: `app/src/store/index.ts` ? merged into CosStore via spread
 * Downstream: `app/src/domain/conversation/api.ts` ? all API functions
 * Pattern: STORE-FIRST ? actions write to store, components read via selectors
 * Tested by: `app/src/store/conversationSlice.test.ts`
 */
export function createConversationSlice(
  set: StoreSet,
  get: StoreGet,
): ConversationSlice {
  const store = { get, set };

  return {
    ...CONVERSATION_INITIAL_STATE,
    sendFollowUp: createSendFollowUp(store),
    hydrateFollowUpHistory: createHydrateFollowUpHistory(store),
    createConversation: createConversationAction(store),
    setActiveConversation: createSetActiveConversation(store),
    fetchBriefingConversations: createFetchBriefingConversations(store),
    setPrefillQuestion: createSetPrefillQuestion(store),
    updateBriefingConversationName: createUpdateBriefingConversationName(store),
    updateBriefingConversationIdentity: createUpdateBriefingConversationIdentity(store),
  };
}
