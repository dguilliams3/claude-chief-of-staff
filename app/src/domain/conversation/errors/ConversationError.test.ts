/**
 * Tests for the ConversationError class.
 *
 * Tests: `app/src/domain/conversation/errors/ConversationError.ts::ConversationError`
 */
import { describe, it, expect } from 'vitest';
import { ConversationError } from './ConversationError';
import { BaseError } from '@/lib/errors';

describe('ConversationError', () => {
  it('extends BaseError', () => {
    const error = new ConversationError('test', 'FETCH_FAILED');
    expect(error).toBeInstanceOf(BaseError);
    expect(error).toBeInstanceOf(Error);
  });

  it('stores message, code, and status', () => {
    const error = new ConversationError('API error: 404', 'NOT_FOUND', 404);
    expect(error.message).toBe('API error: 404');
    expect(error.code).toBe('NOT_FOUND');
    expect(error.status).toBe(404);
  });

  it('sets name to ConversationError', () => {
    const error = new ConversationError('test', 'UNKNOWN');
    expect(error.name).toBe('ConversationError');
  });

  it('status is optional', () => {
    const error = new ConversationError('test', 'FETCH_FAILED');
    expect(error.status).toBeUndefined();
  });
});
