/**
 * Tests: agent/logger.ts
 *
 * Validates Pino logger configuration and export.
 */
import { describe, it, expect } from 'vitest';
import { logger } from '../logger';

describe('logger', () => {
  it('exports a pino logger instance', () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('logs with structured data (info level)', () => {
    // Pino exports a working logger; we validate it's callable
    expect(() => {
      logger.info({ test: 'value' }, 'Test message');
    }).not.toThrow();
  });

  it('logs errors', () => {
    expect(() => {
      logger.error({ code: 'TEST_ERROR' }, 'Error message');
    }).not.toThrow();
  });

  it('logs warnings', () => {
    expect(() => {
      logger.warn({ severity: 'medium' }, 'Warning message');
    }).not.toThrow();
  });

  it('logs debug messages', () => {
    expect(() => {
      logger.debug({ detail: 'debug info' }, 'Debug message');
    }).not.toThrow();
  });
});
