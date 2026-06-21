import { describe, expect, it, vi, beforeEach } from 'vitest';

const { existsSyncMock, readdirSyncMock, readFileSyncMock, warnMock } = vi.hoisted(() => ({
  existsSyncMock: vi.fn(),
  readdirSyncMock: vi.fn(),
  readFileSyncMock: vi.fn(),
  warnMock: vi.fn(),
}));

vi.mock('node:os', () => ({
  homedir: () => '/tmp/test-home',
}));

vi.mock('node:fs', () => ({
  existsSync: existsSyncMock,
  readdirSync: readdirSyncMock,
  readFileSync: readFileSyncMock,
}));

vi.mock('../logger', () => ({
  logger: {
    warn: warnMock,
    info: vi.fn(),
    error: vi.fn(),
  },
}));

import { extractAssistantTexts } from '../session-jsonl';

function normalize(path: string): string {
  return path.replace(/\\/g, '/');
}

function mockDir(name: string): { name: string; isDirectory: () => boolean } {
  return { name, isDirectory: () => true };
}

describe('extractAssistantTexts', () => {
  beforeEach(() => {
    existsSyncMock.mockReset();
    readdirSyncMock.mockReset();
    readFileSyncMock.mockReset();
    warnMock.mockReset();
  });

  it('returns assistant texts sorted by length descending', () => {
    const sessionId = 'session-1';
    existsSyncMock.mockImplementation((rawPath: string) => {
      const path = normalize(rawPath);
      return path.endsWith('/.claude/projects') || path.endsWith(`/project-a/${sessionId}.jsonl`);
    });
    readdirSyncMock.mockReturnValue([mockDir('project-a')]);
    readFileSyncMock.mockReturnValue([
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'tiny' }] },
      }),
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'a much longer assistant answer' }] },
      }),
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'mid sized' }] },
      }),
    ].join('\n'));

    expect(extractAssistantTexts(sessionId)).toEqual([
      'a much longer assistant answer',
      'mid sized',
      'tiny',
    ]);
  });

  it('returns empty array and logs warning when JSONL is not found', () => {
    existsSyncMock.mockImplementation((rawPath: string) => normalize(rawPath).endsWith('/.claude/projects'));
    readdirSyncMock.mockReturnValue([mockDir('project-a')]);

    expect(extractAssistantTexts('missing-session')).toEqual([]);
    expect(warnMock).toHaveBeenCalledWith({ sessionId: 'missing-session' }, 'Session JSONL not found');
  });

  it('skips malformed JSONL lines gracefully', () => {
    const sessionId = 'session-2';
    existsSyncMock.mockImplementation((rawPath: string) => {
      const path = normalize(rawPath);
      return path.endsWith('/.claude/projects') || path.endsWith(`/project-b/${sessionId}.jsonl`);
    });
    readdirSyncMock.mockReturnValue([mockDir('project-b')]);
    readFileSyncMock.mockReturnValue([
      '{not valid json',
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'valid text survives' }] },
      }),
    ].join('\n'));

    expect(extractAssistantTexts(sessionId)).toEqual(['valid text survives']);
  });

  it('filters out non-assistant entries', () => {
    const sessionId = 'session-3';
    existsSyncMock.mockImplementation((rawPath: string) => {
      const path = normalize(rawPath);
      return path.endsWith('/.claude/projects') || path.endsWith(`/project-c/${sessionId}.jsonl`);
    });
    readdirSyncMock.mockReturnValue([mockDir('project-c')]);
    readFileSyncMock.mockReturnValue([
      JSON.stringify({ type: 'user', message: { content: [{ type: 'text', text: 'ignore me' }] } }),
      JSON.stringify({ type: 'tool_result', message: { content: [{ type: 'text', text: 'ignore me too' }] } }),
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'keep me' }] },
      }),
    ].join('\n'));

    expect(extractAssistantTexts(sessionId)).toEqual(['keep me']);
  });
});
