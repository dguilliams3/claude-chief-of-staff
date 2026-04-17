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

const SEVERITY_STYLES = {
  error: 'bg-red-900/90 text-red-100 border-red-700/50',
  warn: 'bg-amber-900/90 text-amber-100 border-amber-700/50',
  info: 'bg-surface-raised/90 text-primary border-border-subtle',
} as const;

export function ToastContainer() {
  const toasts = useStore((s) => s.toasts);
  const dismissToast = useStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-[min(90vw,24rem)]">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          onClick={() => dismissToast(toast.id)}
          className={`
            px-4 py-2.5 rounded-card border
            text-xs font-mono text-left
            backdrop-blur-xl shadow-lg
            animate-[fadeIn_200ms_ease-out]
            ${SEVERITY_STYLES[toast.severity]}
          `}
        >
          {toast.message}
        </button>
      ))}
    </div>
  );
}
