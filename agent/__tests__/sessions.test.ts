/**
 * Tests: `agent/sessions.ts::readSessions`, `agent/sessions.ts::updateSession`
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readSessions, updateSession } from '../sessions';

describe('sessions store', () => {
  let tempDir: string;
  let filePath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'agent-sessions-'));
    filePath = join(tempDir, 'sessions.json');
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates an empty sessions file when missing', () => {
    const sessions = readSessions({ filePath });

    expect(sessions).toEqual({});
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, 'utf-8')).toBe('{}');
  });

  it('creates a new session entry when not resumed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-12T16:20:00.000Z'));

    const entry = updateSession({
      filePath,
      type: 'work',
      sessionId: 'session-1',
      resumed: false,
    });

    expect(entry.session_id).toBe('session-1');
    expect(entry.created_at).toBe('2026-03-12T16:20:00.000Z');
    expect(entry.last_used_at).toBe('2026-03-12T16:20:00.000Z');
    expect(entry.briefing_count).toBe(1);
    expect(existsSync(`${filePath}.tmp`)).toBe(false);
  });

  it('preserves created_at and increments count on resumed session', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-12T16:20:00.000Z'));

    updateSession({
      filePath,
      type: 'news',
      sessionId: 'session-a',
      resumed: false,
    });

    vi.setSystemTime(new Date('2026-03-12T17:00:00.000Z'));

    const updated = updateSession({
      filePath,
      type: 'news',
      sessionId: 'session-b',
      resumed: true,
    });

    expect(updated.session_id).toBe('session-b');
    expect(updated.created_at).toBe('2026-03-12T16:20:00.000Z');
    expect(updated.last_used_at).toBe('2026-03-12T17:00:00.000Z');
    expect(updated.briefing_count).toBe(2);

    const persisted = readSessions({ filePath });
    expect(persisted.news).toEqual(updated);
  });
});
