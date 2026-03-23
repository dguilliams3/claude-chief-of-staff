/**
 * Zustand store — global client state composition root.
 *
 * Composes auth, briefing, conversation, and chats slices into a single store.
 * Each slice is a factory function that returns state + actions, merged via spread.
 *
 * Upstream: Every React component via `useStore()` selector hooks
 * See also: `app/src/store/authSlice.ts` — authentication state
 * See also: `app/src/store/briefingSlice.ts` — briefing state and actions
 * See also: `app/src/store/conversationSlice.ts` — follow-up + hydration state
 * See also: `app/src/store/chatsSlice.ts` — Chats tab state
 * Do NOT: Import React components here — store is framework-agnostic
 * Do NOT: Call `fetch` directly — domain API modules handle all fetches
 */
import { create } from 'zustand';
import { subscribeToPush } from '@/lib/push';
import { initAutoLogin, createAuthSlice, type AuthSlice } from './authSlice';
import { createBriefingSlice, type BriefingSlice } from './briefingSlice';
import { createConversationSlice, type ConversationSlice } from './conversationSlice';
import { createChatsSlice, type ChatsSlice } from './chatsSlice';

interface CosStore extends AuthSlice, BriefingSlice, ConversationSlice, ChatsSlice {
  // View routing
  view: 'today' | 'history' | 'chats';
  setView: (options: { view: 'today' | 'history' | 'chats' }) => void;
}

export const useStore = create<CosStore>((set, get) => {
  // Auto-login: validate stored token on startup (side effect before slice creation)
  const storedToken = initAutoLogin(
    (partial) => set(partial as Partial<CosStore>),
  );

  return {
    // Auth slice — login, logout, token management
    ...createAuthSlice(
      (partial) => set(partial as Partial<CosStore>),
      () => get() as AuthSlice,
      storedToken,
    ),

    // View routing
    view: 'today' as const,

    setView({ view }: { view: 'today' | 'history' | 'chats' }) {
      set({ view, selectedBriefingId: null, selectedBriefing: null } as Partial<CosStore>);
      if (view === 'chats') {
        get().clearSelectedConversation();
      }
    },

    // Briefing slice
    ...createBriefingSlice(
      (partial) => set(partial as Partial<CosStore>),
      () => get() as BriefingSlice,
    ),

    // Conversation slice — follow-up, hydration, multi-chat
    // get() is cast to ConversationSlice & ChatsSlice so deliverFollowUpResponse
    // and handleFollowUpError can read/write ChatsSlice fields without unsafe casts.
    ...createConversationSlice(
      (partial) => set(partial as Partial<CosStore>),
      () => get() as ConversationSlice & ChatsSlice,
    ),

    // Chats slice — Chats tab list/detail navigation
    ...createChatsSlice(
      (partial) => set(partial as Partial<CosStore>),
      () => get() as ChatsSlice,
    ),
  };
});

// Hydrate briefings when auth transitions to authenticated.
// This decouples auth validation from briefing fetching — auth validates via
// /auth/validate, and briefing data is fetched as a side effect of successful auth.
// Always start false so auto-login (stored token → async validation → authenticated=true)
// triggers the subscriber. If we read getState().authenticated here, it's already true
// from createAuthSlice(!!storedToken) and the false→true transition is never detected.
let prevAuthenticated = false;
useStore.subscribe((state) => {
  if (state.authenticated && !prevAuthenticated) {
    state.silentRefresh();
    // Subscribe to push notifications after auth (non-blocking, non-fatal)
    subscribeToPush().catch(() => { /* permission denied or not supported */ });
  }
  prevAuthenticated = state.authenticated;
});
