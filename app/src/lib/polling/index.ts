/**
 * Shared polling utility — adaptive polling with timeout, keyed concurrency,
 * and terminal error detection.
 *
 * Barrel export for the polling module. Used by any store slice or component
 * that needs to poll an async job endpoint.
 *
 * Used by: `app/src/store/conversationSlice.ts`
 * See also: `app/src/lib/polling/pollForResult.ts` — core polling function
 * See also: `app/src/lib/polling/delays.ts` — adaptive delay schedule
 * See also: `app/src/lib/polling/activePolls.ts` — concurrency management
 */

export { pollForResult } from './pollForResult';
export type { PollOptions, PollCallbacks, PollableJobStatus } from './pollForResult';
export { nextPollDelay, MAX_POLL_DURATION_MS } from './delays';
export { stopPolling, stopAllPolling, registerPoll } from './activePolls';
