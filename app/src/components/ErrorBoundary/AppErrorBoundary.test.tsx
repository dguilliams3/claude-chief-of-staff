/**
 * Tests for the recruiter-facing app error boundary.
 *
 * Tests: `app/src/components/ErrorBoundary/AppErrorBoundary.tsx::AppErrorBoundary`
 * Tests: `app/src/components/ErrorBoundary/AppErrorBoundary.tsx::AppCrashFallback`
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppCrashFallback, AppErrorBoundary } from './AppErrorBoundary';

describe('AppErrorBoundary', () => {
  it('captures the thrown error into boundary state', () => {
    const error = new Error('boom');
    expect(AppErrorBoundary.getDerivedStateFromError(error)).toEqual({ error });
  });

  it('renders a graceful crash fallback with a recovery action', () => {
    const html = renderToStaticMarkup(
      <AppCrashFallback onReload={vi.fn()} />,
    );

    expect(html).toContain('Something went wrong');
    expect(html).toContain('Reload app');
    expect(html).not.toContain('App Crash');
  });
});
