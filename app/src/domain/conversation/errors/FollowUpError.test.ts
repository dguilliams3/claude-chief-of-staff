/**
 * Tests for the FollowUpError class.
 *
 * Tests: `app/src/domain/conversation/errors/FollowUpError.ts::FollowUpError`
 */
import { describe, it, expect } from 'vitest';
import { FollowUpError } from '@/domain/conversation/errors';

// ============================================================
// FollowUpError
// ============================================================

describe('FollowUpError', () => {
  it('sets name to FollowUpError', () => {
    const err = new FollowUpError('boom', 'UNKNOWN', false);
    expect(err.name).toBe('FollowUpError');
    expect(err.message).toBe('boom');
    expect(err.code).toBe('UNKNOWN');
  });

  it('carries persisted flag', () => {
    const err = new FollowUpError('x', 'UNKNOWN', true);
    expect(err.persisted).toBe(true);
    expect(err.sessionExpired).toBe(false);
    expect(err.sessionBusy).toBe(false);
    expect(err.userMessage).toBeNull();
  });

  it('derives sessionExpired and sessionBusy from code', () => {
    const err = new FollowUpError('expired', 'SESSION_EXPIRED', false);
    expect(err.sessionExpired).toBe(true);
    expect(err.sessionBusy).toBe(false);

    const busy = new FollowUpError('busy', 'SESSION_BUSY', false);
    expect(busy.sessionBusy).toBe(true);
  });

  it('carries userMessage metadata when provided', () => {
    const um = { id: 'u1', conversationId: 'c1', createdAt: '2026-01-01T00:00:00Z' };
    const err = new FollowUpError('partial', 'TUNNEL_DOWN', true, um);
    expect(err.userMessage).toEqual(um);
  });

  it('is an instance of Error and BaseError', () => {
    const err = new FollowUpError('test', 'UNKNOWN', false);
    expect(err).toBeInstanceOf(Error);
  });
});
