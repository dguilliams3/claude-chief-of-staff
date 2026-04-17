/**
 * Active poll registry — tracks and manages in-flight polling timeouts.
 *
 * Keyed by a caller-provided string (typically historyKey or jobId).
 * Supports concurrent polls across different contexts — stopping one
 * poll doesn't affect others.
 *
 * Used by: `app/src/lib/polling/pollForResult.ts` — registers and clears timeouts
 * Used by: `app/src/store/conversationSlice.ts` — calls stopPolling before new sends
 * Do NOT: Use a single module-level timeout — that kills one context's poll
 *   when another context starts (learned from Opus review finding #2).
 */

/**
 * Map of active poll timeouts keyed by a caller-provided identifier.
 * Each entry represents one in-flight polling loop. Cleaned up
 * automatically on completion, failure, or timeout.
 */
const activePolls = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Map of AbortControllers keyed by poll identifier.
 * One controller per active poll lifecycle — aborted when stopPolling is called
 * to cancel any in-flight fetch for that poll.
 */
const activeAbortControllers = new Map<string, AbortController>();

/**
 * Stops polling for a specific key. Aborts the in-flight fetch (if any)
 * and clears the pending timeout. No-op if no poll is active for that key.
 *
 * @param key - The poll identifier (e.g., historyKey from the store)
 *
 * Upstream: `pollForResult` — on completion, failure, timeout, terminal error
 * Upstream: `conversationSlice.ts::sendFollowUp` — cancels previous poll before starting new
 */
export function stopPolling(key: string): void {
  const timeoutId = activePolls.get(key);
  if (timeoutId) {
    clearTimeout(timeoutId);
    activePolls.delete(key);
  }
  const controller = activeAbortControllers.get(key);
  if (controller) {
    controller.abort();
    activeAbortControllers.delete(key);
  }
}

/**
 * Stops all active polls across all keys. Aborts all in-flight fetches.
 * Used during logout/cleanup.
 *
 * Upstream: `app/src/store/conversationSlice.ts::stopAllPolling` — auth cleanup
 */
export function stopAllPolling(): void {
  for (const timeoutId of activePolls.values()) {
    clearTimeout(timeoutId);
  }
  activePolls.clear();
  for (const controller of activeAbortControllers.values()) {
    controller.abort();
  }
  activeAbortControllers.clear();
}

/**
 * Registers a poll timeout and AbortController for a given key. Overwrites any
 * existing timeout/controller for the same key (the previous one should have
 * been cleared first via stopPolling).
 *
 * @param key - The poll identifier
 * @param timeoutId - The setTimeout return value to track
 * @param controller - AbortController for the next in-flight fetch
 *
 * Upstream: `pollForResult` — after scheduling each successive poll
 * Do NOT: Call without clearing the previous timeout first — use stopPolling(key)
 */
export function registerPoll(
  key: string,
  timeoutId: ReturnType<typeof setTimeout>,
  controller: AbortController,
): void {
  // Defensive: clear any existing timeout/controller before registering a new one.
  // In normal pollForResult flow, the previous timeout has already fired,
  // but external callers might not have cleared first.
  const existing = activePolls.get(key);
  if (existing) clearTimeout(existing);
  const existingController = activeAbortControllers.get(key);
  // Only abort if the existing controller is DIFFERENT from the new one.
  // Within a single poll lifecycle, the same controller is reused across
  // successive registerPoll calls — aborting it would kill the whole chain.
  if (existingController && existingController !== controller) existingController.abort();
  activePolls.set(key, timeoutId);
  activeAbortControllers.set(key, controller);
}
