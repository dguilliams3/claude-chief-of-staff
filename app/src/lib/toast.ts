/**
 * Standalone toast helper — allows non-React code (store slices, API modules)
 * to show toast notifications without importing the store directly.
 *
 * The store wires itself in at creation time via `setToastFn()`.
 *
 * Used by: `app/src/store/index.ts` — wires the addToast function
 * Used by: Store slices — call `toast()` to surface errors
 */

type ToastFn = (message: string, severity?: 'error' | 'warn' | 'info') => void;

let toastFn: ToastFn = () => {
  // No-op until the store wires itself in
};

/** Called once by the store to wire in the real addToast function. */
export function setToastFn(fn: ToastFn) {
  toastFn = fn;
}

/** Show a toast notification. Safe to call before store initialization (no-op). */
export function toast(message: string, severity?: 'error' | 'warn' | 'info') {
  toastFn(message, severity);
}
