/**
 * App shell and authentication gate for the Chief of Staff PWA.
 *
 * MAIN ENTRY POINT for the React component tree. Renders LoginScreen when
 * unauthenticated, otherwise renders AppShell with header and view routing.
 * View routing is conditional on `view` state from Zustand store (no React Router).
 *
 * Used by: `app/src/main.tsx` -- mounted as root component
 * See also: `app/src/store/index.ts` -- auth and view state consumed here
 * Do NOT: Add React Router -- view switching is intentionally store-driven
 */
import { lazy, Suspense } from "react";
import { useStore } from "@/store";
import { AppHeader } from "@/components/AppHeader";
import { TodayView } from "@/views/TodayView";
import { LoginScreen } from "@/views/LoginScreen";
import { ToastContainer } from "@/components/Toast/Toast";

const HistoryView = lazy(async () => {
  const module = await import("@/views/HistoryView");
  return { default: module.HistoryView };
});

const ChatsView = lazy(async () => {
  const module = await import("@/views/ChatsView");
  return { default: module.ChatsView };
});

/**
 * Root component that gates on authentication state.
 * Renders LoginScreen for unauthenticated users, AppShell otherwise.
 *
 * Upstream: `app/src/main.tsx` -- React root render
 * Downstream: `app/src/components/LoginScreen.tsx::LoginScreen`, `App.tsx::AppShell`
 * Pattern: auth-gate -- single boolean check, no route guards
 */
export default function App() {
  const authenticated = useStore((s) => s.authenticated);

  if (!authenticated) return <LoginScreen />;
  return <AppShell />;
}

/**
 * Inner shell rendered after authentication. Displays AppHeader and routes
 * between TodayView, HistoryView, and ChatsView based on `view` store state.
 * Shows a loading spinner while initial briefing data is fetched.
 *
 * Upstream: `app/src/App.tsx::App` -- rendered when `authenticated` is true
 * Downstream: `app/src/components/AppHeader.tsx::AppHeader`,
 *   `app/src/components/TodayView.tsx::TodayView`,
 *   `app/src/components/HistoryView.tsx::HistoryView`,
 *   `app/src/views/ChatsView/ChatsView.tsx::ChatsView`
 * Pattern: view-switch -- conditional on `view` state, no React Router
 */
function AppShell() {
  const view = useStore((s) => s.view);
  const loading = useStore((s) => s.loading);

  if (loading) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <p className="text-muted font-mono text-sm">Loading briefing...</p>
      </div>
    );
  }

  // TodayView and ChatsView use app-shell layout (fixed-height flex container
  // with internal scrolling) so bottom bars stay pinned without position: sticky,
  // which is unreliable on mobile browsers when the address bar resizes the viewport.
  // HistoryView has no bottom bar and uses regular page scrolling.
  const needsAppShell = view === "today" || view === "chats";

  return (
    <div
      className={`bg-background ${needsAppShell ? "h-dvh flex flex-col" : "min-h-dvh"}`}
    >
      <AppHeader />
      {view === "today" && <TodayView />}
      {view === "history" && (
        <Suspense fallback={<HistoryViewFallback />}>
          <HistoryView />
        </Suspense>
      )}
      {view === "chats" && (
        <div className="flex-1 overflow-hidden">
          <Suspense fallback={<ChatsViewFallback />}>
            <ChatsView />
          </Suspense>
        </div>
      )}
      <ToastContainer />
    </div>
  );
}

/**
 * Lightweight fallback while the history bundle streams in.
 * Keeps the same page-width rhythm as the real HistoryView without
 * eagerly importing its full list/detail UI into the default shell chunk.
 */
function HistoryViewFallback() {
  return (
    <div className="px-4 py-4 max-w-2xl mx-auto w-full">
      <p className="font-mono text-sm text-muted">Loading history...</p>
    </div>
  );
}

/**
 * Lightweight fallback while the chats bundle streams in.
 * Preserves the app-shell flex layout so the lazy boundary does not
 * collapse the pinned-bottom chat layout during the short chunk fetch.
 */
function ChatsViewFallback() {
  return (
    <div className="flex h-full items-center justify-center p-4">
      <p className="font-mono text-sm text-muted">Loading chats...</p>
    </div>
  );
}
