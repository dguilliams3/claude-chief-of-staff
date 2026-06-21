/**
 * Error class for briefing API failures — extends BaseError with structured code.
 *
 * Mirrors FollowUpError's pattern: machine-readable `code` field (inherited from
 * BaseError) replaces HTTP-status-based error inference. Thrown by briefing API
 * functions on non-OK responses.
 *
 * Upstream: `app/src/domain/briefing/api.ts` — thrown on non-OK briefing responses
 * Upstream: `app/src/store/briefingSlice.ts` — caught in briefing actions
 * See also: `app/src/lib/errors/BaseError.ts` — parent class
 * See also: `app/src/domain/conversation/errors/FollowUpError.ts` — sibling error class
 * Tested by: `app/src/domain/briefing/errors/BriefingError.test.ts`
 */

import { BaseError } from '@/lib/errors';

/** Error codes for briefing API failures. */
export type BriefingErrorCode =
  | 'FETCH_FAILED'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'UNKNOWN';

export class BriefingError extends BaseError {
  readonly status: number | undefined;

  /**
   * @param message - Human-readable error message
   * @param code - Structured error code for programmatic handling
   * @param status - HTTP status code from the response (if available)
   *
   * Upstream: `app/src/domain/briefing/api.ts` — all fetch functions
   * Downstream: `app/src/store/briefingSlice.ts` — reads code for error handling
   */
  constructor(
    message: string,
    code: BriefingErrorCode,
    status?: number,
  ) {
    super(message, code);
    this.name = 'BriefingError';
    this.status = status;
  }
}
