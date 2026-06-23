import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { SurfaceState } from '@/components/SurfaceState';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

/**
 * AppCrashFallback renders a recruiter-safe recovery screen after a React crash.
 *
 * Replaces the raw stack-trace dump with a branded fallback that preserves the
 * app shell tone and gives the user a direct recovery action.
 *
 * Upstream: `app/src/components/ErrorBoundary/AppErrorBoundary.tsx::AppErrorBoundary`
 * Downstream: `app/src/components/SurfaceState/SurfaceState.tsx::SurfaceState`
 * Tested by: `app/src/components/ErrorBoundary/AppErrorBoundary.test.tsx`
 */
export function AppCrashFallback({
  onReload,
}: {
  onReload: () => void;
}) {
  return (
    <div className="min-h-dvh bg-background">
      <SurfaceState
        title="Something went wrong"
        message="A part of the app crashed. Reload to get back to the briefing."
        tone="error"
      >
        <button
          type="button"
          onClick={onReload}
          className="inline-flex min-h-10 items-center rounded-card bg-accent px-4 py-2 text-sm font-medium text-surface transition-all duration-200 hover:brightness-110"
        >
          Reload app
        </button>
      </SurfaceState>
    </div>
  );
}

/**
 * AppErrorBoundary prevents a single React subtree crash from blanking the app.
 *
 * Logs the component stack for debugging, then swaps the broken subtree for a
 * graceful recovery screen. The fallback intentionally avoids raw stack traces
 * so recruiter click-throughs see a resilient product surface instead of a
 * developer dump.
 *
 * Upstream: `app/src/main.tsx` - wraps the root app tree
 * Downstream: `app/src/components/ErrorBoundary/AppErrorBoundary.tsx::AppCrashFallback`
 * Tested by: `app/src/components/ErrorBoundary/AppErrorBoundary.test.tsx`
 * Do NOT: Render raw error stacks in the recruiter-facing fallback
 */
export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('React crash:', error, info.componentStack);
  }

  private reloadApp = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (this.state.error) {
      return <AppCrashFallback onReload={this.reloadApp} />;
    }
    return this.props.children;
  }
}
