/**
 * Toast notification overlay — renders transient error/info messages.
 *
 * Positioned fixed at bottom-center, above the FollowUpBar. Toasts auto-dismiss
 * after 5s (controlled by toastSlice) or can be tapped to dismiss.
 *
 * Used by: `app/src/main.tsx` — rendered at app root
 * See also: `app/src/store/toastSlice.ts` — toast state and actions
 */
import { useStore } from '@/store';
import type { Toast } from '@/store/toastSlice';

const SEVERITY_STYLES = {
  error: 'bg-severity-flag/20 text-primary border-severity-flag/40',
  warn: 'bg-severity-warn/20 text-primary border-severity-warn/40',
  info: 'bg-surface-raised/90 text-primary border-border-subtle',
} as const;

const LIVE_REGION_BY_SEVERITY: Record<
  Toast['severity'],
  { role: 'alert' | 'status'; ariaLive: 'assertive' | 'polite' }
> = {
  error: { role: 'alert', ariaLive: 'assertive' },
  warn: { role: 'alert', ariaLive: 'assertive' },
  info: { role: 'status', ariaLive: 'polite' },
};

export function ToastContainer() {
  const toasts = useStore((s) => s.toasts);
  const dismissToast = useStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-[min(90vw,24rem)]">
      {toasts.map((toast) => {
        const liveRegion = LIVE_REGION_BY_SEVERITY[toast.severity];
        return (
          <div
            key={toast.id}
            role={liveRegion.role}
            aria-live={liveRegion.ariaLive}
            aria-atomic="true"
            className="w-full"
          >
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              aria-label={`Dismiss notification: ${toast.message}`}
              className={`
                w-full px-4 py-2.5 rounded-card border
                text-xs font-mono text-left
                backdrop-blur-xl shadow-lg
                animate-[fadeIn_200ms_ease-out]
                ${SEVERITY_STYLES[toast.severity]}
              `}
            >
              {toast.message}
            </button>
          </div>
        );
      })}
    </div>
  );
}
