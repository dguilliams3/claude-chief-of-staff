/**
 * Polling delay configuration — adaptive timing and duration limits.
 *
 * Controls how frequently the PWA polls for async job results and when
 * to give up. The adaptive schedule balances responsiveness (user is
 * watching) with efficiency (long-running agentic work).
 *
 * Used by: `app/src/lib/polling/pollForResult.ts`
 * See also: `app/src/components/ChatThread/TypingIndicator.tsx` — uses same 15s threshold for UX
 * Do NOT: Set delays below 1s — wastes bandwidth without improving perceived speed
 */

/** Maximum poll duration before giving up (5 minutes). */
export const MAX_POLL_DURATION_MS = 5 * 60 * 1000;

/**
 * Returns the next poll delay based on elapsed time since the request was sent.
 *
 * Adaptive schedule:
 * - 0–15s: 2s (user is actively watching, quick responses feel instant)
 * - 15–30s: 5s (clearly agentic work, reduce chattiness)
 * - 30s+: 10s (long-running, no need to hammer the server)
 *
 * @param elapsedMs - Milliseconds since the original request was sent
 * @returns Delay in milliseconds before the next poll
 */
export function nextPollDelay(elapsedMs: number): number {
  if (elapsedMs < 15_000) return 2_000;
  if (elapsedMs < 30_000) return 5_000;
  return 10_000;
}
