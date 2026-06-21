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
import { create } from "zustand";
import { subscribeToPush, checkAndRenewPushSubscription } from "@/lib/push";
import { initAutoLogin, createAuthSlice, type AuthSlice } from "./authSlice";
import { createBriefingSlice, type BriefingSlice } from "./briefingSlice";
import {
  createConversationSlice,
  type ConversationSlice,
} from "./conversationSlice";
import { createChatsSlice, type ChatsSlice } from "./chatsSlice";
import { createToastSlice, type ToastSlice } from "./toastSlice";
import { setToastFn } from "@/lib/toast";

interface CosStore
  extends AuthSlice, BriefingSlice, ConversationSlice, ChatsSlice, ToastSlice {
  // View routing
  view: "today" | "history" | "chats";
  setView: (options: { view: "today" | "history" | "chats" }) => void;
}

export const useStore = create<CosStore>((set, get) => {
  // Auto-login: validate stored token on startup (side effect before slice creation)
  const storedToken = initAutoLogin((partial) =>
    set(partial as Partial<CosStore>),
  );

  return {
    // Auth slice — login, logout, token management
    ...createAuthSlice(
      (partial) => set(partial as Partial<CosStore>),
      () => get() as AuthSlice,
      storedToken,
    ),

    // View routing
    view: "today" as const,

    setView({ view }: { view: "today" | "history" | "chats" }) {
      set({
        view,
        selectedBriefingId: null,
        selectedBriefing: null,
      } as Partial<CosStore>);
      if (view === "chats") {
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

    // Toast slice — transient user-facing notifications
    ...createToastSlice(
      (partial) => set(partial as Partial<CosStore>),
      () => get() as ToastSlice,
    ),
  };
});

// Wire the standalone toast helper so non-React callers (API modules, slices)
// can surface errors without importing the store directly.
setToastFn((message, severity) =>
  useStore.getState().addToast(message, severity),
);

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
    // Hydrate briefing-type registry so the UI derives available tabs
    // from the server, not from hardcoded work/news assumptions.
    state.refreshBriefingTypes();
    // Subscribe to push notifications after auth (non-blocking, non-fatal).
    // No userGesture — re-uses granted permission only; Bell button in AppHeader
    // handles the initial iOS-compliant user-gesture permission request.
    subscribeToPush().catch(() => {
      /* permission denied or not supported */
    });
    // Defense-in-depth: re-subscribe weekly / on expiration-time approach so
    // push silently dying after 30-90 days doesn't leave users without notifs.
    checkAndRenewPushSubscription().catch(() => {
      /* non-fatal */
    });
  }
  prevAuthenticated = state.authenticated;
});

// Re-fetch briefings when the tab becomes visible again (e.g., user switches back
// to the PWA after triggering a briefing and going away). Without this, the store
// shows stale data because silentRefresh only fires on auth transitions.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && useStore.getState().authenticated) {
      useStore.getState().silentRefresh();
    }
  });
}
