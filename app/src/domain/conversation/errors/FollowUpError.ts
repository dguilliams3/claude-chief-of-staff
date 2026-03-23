/**
 * Error class for follow-up failures — extends BaseError with structured code.
 *
 * Carries persistence status and error classification. The `code` field
 * (inherited from BaseError) replaces HTTP-status-based error inference —
 * the Worker returns the code explicitly in the response body.
 *
 * Upstream: `app/src/domain/conversation/api.ts` — thrown on non-OK follow-up responses
 * Upstream: `app/src/store/conversationSlice.ts` — caught in sendFollowUp action
 * Coupling: `worker/src/routes/proxy.ts` — error response shape includes `code` field
 * See also: `app/src/lib/errors/BaseError.ts` — parent class
 * Tested by: `app/src/domain/conversation/errors/FollowUpError.test.ts`
 */

import { BaseError } from '@/lib/errors';

/** Error codes returned by the Worker for follow-up failures. */
export type FollowUpErrorCode =
  | 'SESSION_EXPIRED'
  | 'SESSION_BUSY'
  | 'NOT_FOUND'
  | 'TUNNEL_DOWN'
  | 'INVALID_REQUEST'
  | 'UNKNOWN';

export class FollowUpError extends BaseError {
  readonly persisted: boolean;
  readonly sessionExpired: boolean;
  readonly sessionBusy: boolean;
  readonly userMessage: { id: string; conversationId: string; createdAt: string } | null;

  /**
   * @param message - Human-readable error message
   * @param code - Structured error code from the Worker response body
   * @param persisted - Whether the user message was saved to D1 before the error
   * @param userMessage - D1 metadata for the persisted user message, if any
   *
   * Upstream: `app/src/domain/conversation/api.ts::sendFollowUp`
   * Downstream: `app/src/store/conversationSlice.ts::handleFollowUpError` — reads flags for UI error state
   */
  constructor(
    message: string,
    code: FollowUpErrorCode,
    persisted: boolean,
    userMessage: { id: string; conversationId: string; createdAt: string } | null = null,
  ) {
    super(message, code);
    this.name = 'FollowUpError';
    this.persisted = persisted;
    this.sessionExpired = code === 'SESSION_EXPIRED';
    this.sessionBusy = code === 'SESSION_BUSY';
    this.userMessage = userMessage;
  }
}
