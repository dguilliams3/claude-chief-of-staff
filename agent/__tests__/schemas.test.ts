/**
 * Tests: agent/schemas.ts
 *
 * Validates Zod schema parsing for ClaudeJsonEnvelope at the CLI output boundary.
 */
import { describe, it, expect } from 'vitest';
import { ClaudeJsonEnvelope } from '../schemas';

describe('ClaudeJsonEnvelope', () => {
  it('parses valid envelope with all fields', () => {
    const input = {
      result: 'test result',
      session_id: 'session-123',
      duration_ms: 1500,
      total_cost_usd: 0.05,
    };
    const parsed = ClaudeJsonEnvelope.parse(input);
    expect(parsed).toEqual(input);
  });

  it('parses valid envelope with required fields only', () => {
    const input = {
      result: 'test result',
      session_id: 'session-456',
    };
    const parsed = ClaudeJsonEnvelope.parse(input);
    expect(parsed.result).toBe('test result');
    expect(parsed.session_id).toBe('session-456');
    expect(parsed.duration_ms).toBeUndefined();
    expect(parsed.total_cost_usd).toBeUndefined();
  });

  it('parses envelope with only duration_ms optional field', () => {
    const input = {
      result: 'test',
      session_id: 'session-789',
      duration_ms: 2000,
    };
    const parsed = ClaudeJsonEnvelope.parse(input);
    expect(parsed.duration_ms).toBe(2000);
    expect(parsed.total_cost_usd).toBeUndefined();
  });

  it('parses envelope with only total_cost_usd optional field', () => {
    const input = {
      result: 'test',
      session_id: 'session-101',
      total_cost_usd: 0.03,
    };
    const parsed = ClaudeJsonEnvelope.parse(input);
    expect(parsed.total_cost_usd).toBe(0.03);
    expect(parsed.duration_ms).toBeUndefined();
  });

  it('throws when result field is missing', () => {
    const input = {
      session_id: 'session-123',
      duration_ms: 1000,
    };
    expect(() => ClaudeJsonEnvelope.parse(input)).toThrow();
  });

  it('throws when session_id field is missing', () => {
    const input = {
      result: 'test',
      duration_ms: 1000,
    };
    expect(() => ClaudeJsonEnvelope.parse(input)).toThrow();
  });

  it('throws when result is not a string', () => {
    const input = {
      result: 123,
      session_id: 'session-123',
    };
    expect(() => ClaudeJsonEnvelope.parse(input)).toThrow();
  });

  it('throws when session_id is not a string', () => {
    const input = {
      result: 'test',
      session_id: 456,
    };
    expect(() => ClaudeJsonEnvelope.parse(input)).toThrow();
  });

  it('throws when duration_ms is not a number', () => {
    const input = {
      result: 'test',
      session_id: 'session-123',
      duration_ms: 'not a number',
    };
    expect(() => ClaudeJsonEnvelope.parse(input)).toThrow();
  });

  it('throws when total_cost_usd is not a number', () => {
    const input = {
      result: 'test',
      session_id: 'session-123',
      total_cost_usd: 'not a number',
    };
    expect(() => ClaudeJsonEnvelope.parse(input)).toThrow();
  });

  it('throws on empty object', () => {
    expect(() => ClaudeJsonEnvelope.parse({})).toThrow();
  });
});
