/**
 * Base error class for all domain-specific errors.
 *
 * Provides a structured `code` field for programmatic error classification.
 * Domain errors extend this class and define their own code unions.
 * The `code` field replaces HTTP-status-based error inference — the server
 * returns the code explicitly, and the client reads it directly.
 *
 * Upstream: `app/src/domain/conversation/errors/FollowUpError.ts` — extends this
 * See also: `app/src/lib/errors/index.ts` — barrel
 * Do NOT: Throw BaseError directly — always use a domain-specific subclass
 * Do NOT: Infer error type from HTTP status codes — use the `code` field
 */

/**
 * Abstract base for all structured application errors.
 *
 * @param message - Human-readable error message
 * @param code - Machine-readable error classification code
 */
export class BaseError extends Error {
  /** Machine-readable error code for programmatic handling. */
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'BaseError';
    this.code = code;
  }
}
