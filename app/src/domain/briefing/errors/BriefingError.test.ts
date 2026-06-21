/**
 * Tests for the BriefingError class.
 *
 * Tests: `app/src/domain/briefing/errors/BriefingError.ts::BriefingError`
 */
import { describe, it, expect } from 'vitest';
import { BriefingError } from './BriefingError';
import { BaseError } from '@/lib/errors';

describe('BriefingError', () => {
  it('extends BaseError', () => {
    const error = new BriefingError('test', 'FETCH_FAILED');
    expect(error).toBeInstanceOf(BaseError);
    expect(error).toBeInstanceOf(Error);
  });

  it('stores message, code, and status', () => {
    const error = new BriefingError('API error: 401', 'UNAUTHORIZED', 401);
    expect(error.message).toBe('API error: 401');
    expect(error.code).toBe('UNAUTHORIZED');
    expect(error.status).toBe(401);
  });

  it('sets name to BriefingError', () => {
    const error = new BriefingError('test', 'UNKNOWN');
    expect(error.name).toBe('BriefingError');
  });

  it('status is optional', () => {
    const error = new BriefingError('test', 'FETCH_FAILED');
    expect(error.status).toBeUndefined();
  });
});
