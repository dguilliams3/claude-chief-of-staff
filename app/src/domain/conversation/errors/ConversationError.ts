/**
 * Error class for conversation API failures — extends BaseError with structured code.
 *
 * Used by conversation CRUD and polling functions (NOT sendFollowUp — that uses
 * FollowUpError with its special persisted/sessionExpired semantics).
 *
 * Upstream: `app/src/domain/conversation/api.ts` — thrown on non-OK responses
 * See also: `app/src/lib/errors/BaseError.ts` — parent class
 * See also: `app/src/domain/conversation/errors/FollowUpError.ts` — sibling error for follow-up sends
 * Tested by: `app/src/domain/conversation/errors/ConversationError.test.ts`
 */

import { BaseError } from '@/lib/errors';

/** Error codes for conversation API failures. */
export type ConversationErrorCode =
  | 'FETCH_FAILED'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'UNKNOWN';

export class ConversationError extends BaseError {
  readonly status: number | undefined;

  /**
   * @param message - Human-readable error message
   * @param code - Structured error code for programmatic handling
   * @param status - HTTP status code from the response (if available)
   */
  constructor(
    message: string,
    code: ConversationErrorCode,
    status?: number,
  ) {
    super(message, code);
    this.name = 'ConversationError';
    this.status = status;
  }
}
