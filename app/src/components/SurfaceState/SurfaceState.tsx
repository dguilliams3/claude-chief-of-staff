import type { ReactNode } from 'react';

/**
 * SurfaceState renders a calm, centered state card for empty and error cases.
 *
 * Keeps recruiter-visible surfaces from collapsing into raw text, blank panels,
 * or ad-hoc button layouts. Callers provide the specific message and any retry
 * or navigation actions as children.
 *
 * Upstream: `app/src/views/TodayView/TodayView.tsx::TodayView`
 * Upstream: `app/src/views/HistoryView/HistoryView.tsx::HistoryView`
 * Upstream: `app/src/views/ChatsView/ChatsView.tsx::ChatsView`
 * Upstream: `app/src/components/ErrorBoundary/AppErrorBoundary.tsx::AppCrashFallback`
 * Pattern: PRESENTATIONAL - no store reads, no side effects
 * Do NOT: Put fetch or retry logic here - callers own actions and state
 */
export function SurfaceState({
  title,
  message,
  tone = 'neutral',
  children,
}: {
  title: string;
  message: string;
  tone?: 'neutral' | 'error';
  children?: ReactNode;
}) {
  const accentClasses =
    tone === 'error'
      ? 'border-severity-flag/40 bg-severity-flag/8'
      : 'border-border-subtle bg-surface';

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-8">
      <div
        className={`w-full max-w-md rounded-card border px-5 py-5 text-center shadow-sm ${accentClasses}`}
      >
        <h2 className="font-body text-base font-semibold text-primary">{title}</h2>
        <p className="mt-2 text-sm text-muted">{message}</p>
        {children ? <div className="mt-4 flex flex-wrap items-center justify-center gap-3">{children}</div> : null}
      </div>
    </div>
  );
}
