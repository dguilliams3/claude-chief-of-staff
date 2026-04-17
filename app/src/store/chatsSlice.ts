/**
 * Zustand chats slice — Chats tab list/detail navigation state.
 *
 * Manages the conversation list view, conversation selection, and message
 * loading for the Chats tab. Fully independent from follow-up state —
 * reads from D1 via API, does not touch followUpHistory.
 *
 * Extracted from conversationSlice.ts per architecture cleanup council
 * recommendation. Guard rail: no cross-slice imports — chatsSlice reads
 * from D1, conversationSlice owns followUpHistory.
 *
 * Used by: `app/src/store/index.ts` — merged into CosStore via spread
 * See also: `app/src/store/conversationSlice.ts` — follow-up + hydration state
 * See also: `app/src/domain/conversation/api.ts` — HTTP client functions called by this slice
 * Do NOT: Import conversationSlice or access followUpHistory — no cross-slice coupling
 * Do NOT: Call fetch directly — use domain/conversation/api.ts functions
 */
import type { Message, ConversationListItem } from '@/domain/conversation';
import {
  fetchConversations as apiFetchConversations,
  fetchConversationMessages as apiFetchMessages,
  updateConversationName as apiUpdateConversationName,
} from '@/domain/conversation';

export interface ChatsSlice {
  /** All conversations for the Chats tab list */
  conversations: ConversationListItem[];
  /** Whether the conversation list is loading */
  conversationsLoading: boolean;
  /** Currently selected conversation in the detail view (null = list view) */
  selectedConversation: ConversationListItem | null;
  /** Messages for the selected conversation */
  selectedConversationMessages: Message[];
  /** Whether selected conversation messages are loading */
  selectedConversationLoading: boolean;
  /** Per-conversation error messages (keyed by conversation ID) */
  conversationErrors: Record<string, string>;

  // Actions
  fetchConversations: () => Promise<void>;
  selectConversation: (options: { conversation: ConversationListItem | null }) => Promise<void>;
  clearSelectedConversation: () => void;
  renameConversation: (opts: { conversationId: string; name: string }) => Promise<void>;
}

type StoreGet = () => ChatsSlice;
type StoreSet = (partial: Partial<ChatsSlice>) => void;

/** Initial chats data state — used by createChatsSlice and logout reset. */
export const CHATS_INITIAL_STATE: Pick<
  ChatsSlice,
  'conversations' | 'conversationsLoading' | 'selectedConversation' |
  'selectedConversationMessages' | 'selectedConversationLoading' | 'conversationErrors'
> = {
  conversations: [],
  conversationsLoading: false,
  selectedConversation: null,
  selectedConversationMessages: [],
  selectedConversationLoading: false,
  conversationErrors: {},
};

/**
 * Creates the chats slice — Chats tab list/detail navigation state.
 *
 * @param set - Zustand set function for partial state updates
 * @param get - Zustand get function — used by renameConversation to read current state
 * @returns ChatsSlice with initial state and bound actions
 *
 * Upstream: `app/src/store/index.ts` — merged into CosStore via spread
 * Downstream: `app/src/domain/conversation/api.ts` — fetchConversations, fetchConversationMessages, updateConversationName
 * Pattern: STORE-FIRST — actions write to store, components read via selectors
 * Tested by: `app/src/store/chatsSlice.test.ts`
 * Do NOT: Import conversationSlice or access followUpHistory — no cross-slice coupling
 */
export function createChatsSlice(set: StoreSet, get: StoreGet): ChatsSlice {
  return {
    ...CHATS_INITIAL_STATE,

    async fetchConversations() {
      set({ conversationsLoading: true });
      try {
        const list = await apiFetchConversations();
        set({ conversations: list, conversationsLoading: false });
      } catch {
        set({ conversationsLoading: false });
      }
    },

    async selectConversation({ conversation }: { conversation: ConversationListItem | null }) {
      if (!conversation) {
        set({ selectedConversation: null, selectedConversationMessages: [] });
        return;
      }
      set({ selectedConversation: conversation, selectedConversationLoading: true });
      try {
        const messages = await apiFetchMessages({ conversationId: conversation.id });
        // Guard: if the user rapidly switched conversations, the selected conversation
        // may have changed while we were fetching. Only commit if still selected.
        if (get().selectedConversation?.id === conversation.id) {
          set({ selectedConversationMessages: messages, selectedConversationLoading: false });
        }
      } catch {
        // Only clear if this conversation is still selected (same race guard)
        if (get().selectedConversation?.id === conversation.id) {
          set({ selectedConversation: null, selectedConversationMessages: [], selectedConversationLoading: false });
        }
      }
    },

    clearSelectedConversation() {
      set({ selectedConversation: null, selectedConversationMessages: [], selectedConversationLoading: false });
    },

    async renameConversation({ conversationId, name }: { conversationId: string; name: string }) {
      await apiUpdateConversationName({ conversationId, name });
      const current = get();
      set({
        conversations: current.conversations.map(conversation =>
          conversation.id === conversationId ? { ...conversation, name } : conversation
        ),
        selectedConversation: current.selectedConversation?.id === conversationId
          ? { ...current.selectedConversation, name }
          : current.selectedConversation,
      });
      // Note: briefingConversations sync is handled by ConversationDetail calling
      // updateBriefingConversationName separately (cross-slice constraint).
    },
  };
}
