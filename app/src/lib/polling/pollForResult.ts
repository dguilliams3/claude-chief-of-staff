/**
 * Core polling function — polls an async job endpoint with adaptive delays.
 *
 * Handles the full polling lifecycle:
 * - Adaptive delays: 2s → 5s → 10s based on elapsed time
 * - Max duration: 5 minutes, then timeout callback
 * - Terminal error detection: 404 = job expired or server restarted
 * - Duplicate completion guard: onComplete fires at most once
 *
 * This is a pure utility — no Zustand imports, no store state. The caller
 * provides a `fetchStatus` function and lifecycle callbacks that bridge
 * to whatever state management is in use.
 *
 * Used by: `app/src/store/conversationSlice.ts::sendFollowUp`
 * See also: `app/src/lib/polling/delays.ts` — adaptive delay schedule
 * See also: `app/src/lib/polling/activePolls.ts` — timeout registry
 * Do NOT: Import store state here — callbacks are the bridge
 * Do NOT: Use setInterval — setTimeout chains enable adaptive delays
 */

import { nextPollDelay, MAX_POLL_DURATION_MS } from './delays';
import { stopPolling, registerPoll } from './activePolls';

/**
 * Options for pollForResult — everything needed to manage a polling lifecycle.
 *
 * Coupling: `app/src/lib/polling/activePolls.ts` — pollKey maps to the activePolls Map key
 */
export interface PollOptions {
  /** Key for the active polls registry — must be unique per concurrent poll */
  pollKey: string;
  /** Date.now() when the original request was sent — drives adaptive delays and max duration */
  startedAt: number;
}

/**
 * Minimum shape a job status response must satisfy for pollForResult to work.
 * Callers can extend this with domain-specific fields.
 */
export interface PollableJobStatus {
  /** Current job state */
  status: 'running' | 'completed' | 'failed';
  /** Error message when status is 'failed' */
  error?: string;
}

/**
 * Lifecycle callbacks invoked by pollForResult at each milestone.
 *
 * @typeParam T - The specific job status type (must extend PollableJobStatus)
 */
export interface PollCallbacks<T extends PollableJobStatus> {
  /** Called once when the job completes successfully. The completed guard ensures at-most-once. */
  onComplete: (job: T) => void;
  /** Called when the job reports failure (status: 'failed') */
  onFailed: (error: string) => void;
  /** Called when MAX_POLL_DURATION_MS is exceeded without completion */
  onTimeout: () => void;
  /** Called on terminal fetch errors (e.g., 404 — job expired, server restarted) */
  onTerminalError: (error: string) => void;
}

/**
 * Polls for a job result with adaptive delays and lifecycle callbacks.
 *
 * @param options - Poll configuration (key for concurrency, start time for delays)
 * @param callbacks - Lifecycle handlers for each outcome
 * @param fetchStatus - Async function that fetches the current job status.
 *   Receives an AbortSignal — pass it to the underlying fetch() call so the
 *   request is cancelled when stopPolling() is called mid-flight.
 *   Must return a PollableJobStatus-compatible object.
 *   Throw an Error with "404" in the message for terminal (job-gone) errors.
 *
 * @example
 * ```ts
 * pollForResult(
 *   { pollKey: briefingId, startedAt: Date.now() },
 *   {
 *     onComplete: (job) => set({ result: job }),
 *     onFailed: (error) => set({ error }),
 *     onTimeout: () => set({ error: 'Timed out' }),
 *     onTerminalError: (error) => set({ error }),
 *   },
 *   (signal) => apiFetchFollowUpStatus({ jobId, signal }),
 * );
 * ```
 */
export function pollForResult<T extends PollableJobStatus>(
  options: PollOptions,
  callbacks: PollCallbacks<T>,
  fetchStatus: (signal: AbortSignal) => Promise<T>,
): void {
  let completed = false;

  // One AbortController for the entire poll lifecycle. All fetch attempts share
  // this signal. When stopPolling() is called it aborts the controller, cancelling
  // any in-flight fetch and preventing further callback invocations.
  const controller = new AbortController();
  const { signal } = controller;

  const poll = async () => {
    // If the poll was stopped externally before this tick, bail immediately.
    if (signal.aborted) return;

    const elapsed = Date.now() - options.startedAt;

    // Guard: max poll duration. After this, give up and notify caller.
    // The response may still arrive in D1 — hydration picks it up on next visit.
    if (elapsed > MAX_POLL_DURATION_MS) {
      callbacks.onTimeout();
      stopPolling(options.pollKey);
      return;
    }

    try {
      const job = await fetchStatus(signal);

      // Guard: poll was aborted while the fetch was in-flight — discard silently.
      if (signal.aborted) return;

      if (job.status === 'completed' && !completed) {
        // Guard: at-most-once completion — prevents duplicate appends
        // if a network retry causes two responses for the same poll.
        completed = true;
        callbacks.onComplete(job);
        stopPolling(options.pollKey);
        return;
      }

      if (job.status === 'failed') {
        callbacks.onFailed(job.error ?? 'Job failed');
        stopPolling(options.pollKey);
        return;
      }

      // Still running — schedule next poll with adaptive delay
      registerPoll(options.pollKey, setTimeout(poll, nextPollDelay(elapsed)), controller);
    } catch (pollError) {
      // Aborted fetch — poll was stopped externally, discard silently.
      if (pollError instanceof Error && pollError.name === 'AbortError') return;

      // Treat 404 as terminal — job expired or server restarted.
      // The user message is already in D1; only the response is lost.
      if (pollError instanceof Error && pollError.message.includes('404')) {
        callbacks.onTerminalError(
          'Response lost — the server may have restarted. Try sending again.',
        );
        stopPolling(options.pollKey);
        return;
      }

      // Other fetch errors (network blip, 500, etc.) — retry on next interval
      registerPoll(
        options.pollKey,
        setTimeout(poll, nextPollDelay(Date.now() - options.startedAt)),
        controller,
      );
    }
  };

  // First poll after initial adaptive delay
  registerPoll(options.pollKey, setTimeout(poll, nextPollDelay(0)), controller);
}
