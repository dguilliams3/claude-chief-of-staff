/**
 * Zustand toast slice — transient user-facing notifications.
 *
 * Provides a simple queue of toast messages that auto-dismiss after a timeout.
 * Used by other slices to surface errors that would otherwise be silently swallowed.
 *
 * Used by: `app/src/store/index.ts` — merged via createToastSlice()
 * See also: `app/src/components/Toast/Toast.tsx` — renders the toast queue
 * Do NOT: Use for persistent errors — use slice-level error state instead
 */

export interface Toast {
  id: string;
  message: string;
  severity: "error" | "warn" | "info";
}

export interface ToastSlice {
  toasts: Toast[];
  addToast: (message: string, severity?: Toast["severity"]) => void;
  dismissToast: (id: string) => void;
}

/** How long toasts stay visible before auto-dismissing. */
const AUTO_DISMISS_MS = 5000;

type StoreSet = (partial: Partial<ToastSlice>) => void;
type StoreGet = () => ToastSlice;

export const TOAST_INITIAL_STATE: Pick<ToastSlice, "toasts"> = {
  toasts: [],
};

export function createToastSlice(set: StoreSet, _get: StoreGet): ToastSlice {
  return {
    ...TOAST_INITIAL_STATE,

    addToast(message: string, severity: Toast["severity"] = "error") {
      const id = crypto.randomUUID();
      set({ toasts: [..._get().toasts, { id, message, severity }] });

      setTimeout(() => {
        set({ toasts: _get().toasts.filter((t) => t.id !== id) });
      }, AUTO_DISMISS_MS);
    },

    dismissToast(id: string) {
      set({ toasts: _get().toasts.filter((t) => t.id !== id) });
    },
  };
}
