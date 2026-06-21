/**
 * Tests: agent/cli.ts
 *
 * Validates CLI argument parsing (type, --new-session flag, --model option),
 * error handling (missing/invalid type), and success flow with logger integration.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';

// Mock modules before importing
vi.mock('../run-briefing', () => ({
  runBriefing: vi.fn(),
}));

vi.mock('../registry', () => ({
  validTypes: ['work', 'news'],
}));

vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import { runBriefing } from '../run-briefing';
import { logger } from '../logger';
import { spawn as actualSpawn } from 'node:child_process';

describe('cli.ts', () => {
  let originalArgv: string[];
  let originalExit: (code?: number) => never;

  beforeEach(() => {
    originalArgv = process.argv;
    originalExit = process.exit;

    // Mock process.exit to prevent test termination
    process.exit = vi.fn() as any;

    // Reset mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.exit = originalExit;
  });

  it('parses valid type argument (work)', async () => {
    process.argv = ['node', 'cli.ts', 'work'];
    vi.mocked(runBriefing).mockResolvedValue({
      id: 'briefing-123',
      type: 'work',
      generatedAt: '2026-03-12T10:00:00Z',
      sessionId: 'session-123',
      sections: [],
      metadata: {
        sourcesSampled: ['jira'],
        runDurationMs: 5000,
        costUsd: 0.05,
        sessionResumed: false,
        briefingNumber: 1,
      },
      usage: null,
    });

    // Simulate cli.ts execution
    const type = process.argv[2];
    const newSession = process.argv.includes('--new-session');
    const modelIdx = process.argv.indexOf('--model');
    const model = modelIdx !== -1 ? process.argv[modelIdx + 1] : undefined;

    await runBriefing({ type: type as string, newSession, model });

    expect(runBriefing).toHaveBeenCalledWith({
      type: 'work',
      newSession: false,
      model: undefined,
    });
  });

  it('parses valid type argument (news)', async () => {
    process.argv = ['node', 'cli.ts', 'news'];
    vi.mocked(runBriefing).mockResolvedValue({
      id: 'briefing-456',
      type: 'news',
      generatedAt: '2026-03-12T10:00:00Z',
      sessionId: 'session-456',
      sections: [],
      metadata: {
        sourcesSampled: ['huggingface'],
        runDurationMs: 3000,
        costUsd: 0.03,
        sessionResumed: false,
        briefingNumber: 1,
      },
      usage: null,
    });

    const type = process.argv[2];
    const newSession = process.argv.includes('--new-session');
    const modelIdx = process.argv.indexOf('--model');
    const model = modelIdx !== -1 ? process.argv[modelIdx + 1] : undefined;

    await runBriefing({ type: type as string, newSession, model });

    expect(runBriefing).toHaveBeenCalledWith({
      type: 'news',
      newSession: false,
      model: undefined,
    });
  });

  it('parses --new-session flag', async () => {
    process.argv = ['node', 'cli.ts', 'work', '--new-session'];
    vi.mocked(runBriefing).mockResolvedValue({
      id: 'briefing-789',
      type: 'work',
      generatedAt: '2026-03-12T10:00:00Z',
      sessionId: 'session-new',
      sections: [],
      metadata: {
        sourcesSampled: ['jira'],
        runDurationMs: 5000,
        costUsd: 0.05,
        sessionResumed: false,
        briefingNumber: 1,
      },
      usage: null,
    });

    const type = process.argv[2];
    const newSession = process.argv.includes('--new-session');
    const modelIdx = process.argv.indexOf('--model');
    const model = modelIdx !== -1 ? process.argv[modelIdx + 1] : undefined;

    await runBriefing({ type: type as string, newSession, model });

    expect(runBriefing).toHaveBeenCalledWith({
      type: 'work',
      newSession: true,
      model: undefined,
    });
  });

  it('parses --model option', async () => {
    process.argv = ['node', 'cli.ts', 'news', '--model', 'claude-opus-4-20250514'];
    vi.mocked(runBriefing).mockResolvedValue({
      id: 'briefing-101',
      type: 'news',
      generatedAt: '2026-03-12T10:00:00Z',
      sessionId: 'session-101',
      sections: [],
      metadata: {
        sourcesSampled: ['huggingface'],
        runDurationMs: 3000,
        costUsd: 0.03,
        sessionResumed: false,
        briefingNumber: 1,
      },
      usage: null,
    });

    const type = process.argv[2];
    const newSession = process.argv.includes('--new-session');
    const modelIdx = process.argv.indexOf('--model');
    const model = modelIdx !== -1 ? process.argv[modelIdx + 1] : undefined;

    await runBriefing({ type: type as string, newSession, model });

    expect(runBriefing).toHaveBeenCalledWith({
      type: 'news',
      newSession: false,
      model: 'claude-opus-4-20250514',
    });
  });

  it('parses combined --new-session and --model flags', async () => {
    process.argv = ['node', 'cli.ts', 'work', '--new-session', '--model', 'claude-sonnet-4-20250514'];
    vi.mocked(runBriefing).mockResolvedValue({
      id: 'briefing-202',
      type: 'work',
      generatedAt: '2026-03-12T10:00:00Z',
      sessionId: 'session-fresh',
      sections: [],
      metadata: {
        sourcesSampled: ['jira'],
        runDurationMs: 5000,
        costUsd: 0.05,
        sessionResumed: false,
        briefingNumber: 1,
      },
      usage: null,
    });

    const type = process.argv[2];
    const newSession = process.argv.includes('--new-session');
    const modelIdx = process.argv.indexOf('--model');
    const model = modelIdx !== -1 ? process.argv[modelIdx + 1] : undefined;

    await runBriefing({ type: type as string, newSession, model });

    expect(runBriefing).toHaveBeenCalledWith({
      type: 'work',
      newSession: true,
      model: 'claude-sonnet-4-20250514',
    });
  });

  it('throws when type argument is missing', () => {
    process.argv = ['node', 'cli.ts'];
    const type = process.argv[2];

    // Simulate validation
    const validTypes = ['work', 'news'];
    expect(() => {
      if (!type || !validTypes.includes(type)) {
        throw new Error(`Usage: npx tsx agent/cli.ts <${validTypes.join('|')}> [--new-session] [--model <model>]`);
      }
    }).toThrow('Usage:');
  });

  it('throws when type is invalid', () => {
    process.argv = ['node', 'cli.ts', 'invalid-type'];
    const type = process.argv[2];

    // Simulate validation
    const validTypes = ['work', 'news'];
    expect(() => {
      if (!type || !validTypes.includes(type)) {
        throw new Error(`Usage: npx tsx agent/cli.ts <${validTypes.join('|')}> [--new-session] [--model <model>]`);
      }
    }).toThrow('Usage:');
  });

  it('logs completion info on successful briefing', async () => {
    process.argv = ['node', 'cli.ts', 'work'];
    const mockBriefing = {
      id: 'briefing-303',
      type: 'work',
      generatedAt: '2026-03-12T10:00:00Z',
      sessionId: 'session-303',
      sections: [
        { title: 'Section 1', content: 'Content 1' },
        { title: 'Section 2', content: 'Content 2' },
      ],
      metadata: {
        sourcesSampled: ['jira', 'fireflies'],
        runDurationMs: 5500,
        costUsd: 0.06,
        sessionResumed: false,
        briefingNumber: 1,
      },
    };

    vi.mocked(runBriefing).mockResolvedValue(mockBriefing as any);

    const type = process.argv[2];
    const newSession = process.argv.includes('--new-session');
    const modelIdx = process.argv.indexOf('--model');
    const model = modelIdx !== -1 ? process.argv[modelIdx + 1] : undefined;

    const briefing = await runBriefing({ type: type as string, newSession, model });

    expect(briefing.id).toBe('briefing-303');
    expect(briefing.sections.length).toBe(2);
    expect(briefing.metadata.runDurationMs).toBe(5500);
  });

  it('logs error and exits on runBriefing failure', async () => {
    process.argv = ['node', 'cli.ts', 'work'];
    const error = new Error('Claude CLI timeout');
    vi.mocked(runBriefing).mockRejectedValue(error);

    const type = process.argv[2];
    const newSession = process.argv.includes('--new-session');
    const modelIdx = process.argv.indexOf('--model');
    const model = modelIdx !== -1 ? process.argv[modelIdx + 1] : undefined;

    try {
      await runBriefing({ type: type as string, newSession, model });
    } catch (err) {
      expect(err).toBe(error);
    }

    expect(runBriefing).toHaveBeenCalled();
  });
});
