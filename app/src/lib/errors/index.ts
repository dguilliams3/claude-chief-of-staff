/**
 * Shared error infrastructure — base class for all domain-specific errors.
 *
 * Domain errors (e.g., FollowUpError) extend BaseError to get structured
 * `code` fields for programmatic classification. The `code` replaces
 * HTTP-status-based error inference.
 *
 * Upstream: `app/src/domain/conversation/errors/FollowUpError.ts`
 * Upstream: `app/src/domain/briefing/errors/BriefingError.ts`
 * See also: `app/src/lib/api/` — sibling infrastructure module
 */

export { BaseError } from './BaseError';
