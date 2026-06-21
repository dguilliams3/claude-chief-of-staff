import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  parseSectionsMock,
  extractAssistantTextsMock,
  callClaudeMock,
  buildClaudeArgsMock,
  updateSessionMock,
  syncToD1Mock,
  writeFileSyncMock,
  mkdirSyncMock,
} = vi.hoisted(() => ({
  parseSectionsMock: vi.fn(),
  extractAssistantTextsMock: vi.fn(),
  callClaudeMock: vi.fn(),
  buildClaudeArgsMock: vi.fn(() => ['--print']),
  updateSessionMock: vi.fn(() => ({ briefing_count: 1 })),
  syncToD1Mock: vi.fn(async () => undefined),
  writeFileSyncMock: vi.fn(),
  mkdirSyncMock: vi.fn(),
}));

vi.mock('node:crypto', () => ({
  randomUUID: () => 'briefing-id-1234',
}));

vi.mock('node:fs', () => ({
  writeFileSync: writeFileSyncMock,
  mkdirSync: mkdirSyncMock,
}));

vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../registry', () => ({
  validTypes: ['work'],
  briefingTypes: {
    work: {
      prompt: { components: [] },
      timeoutMs: 30_000,
      sourcesSampled: ['sample-source'],
    },
  },
}));

vi.mock('../prompts/compile', () => ({
  compile: vi.fn(() => ({ system: 'system', user: 'user' })),
}));

vi.mock('../claude-cli', () => ({
  buildClaudeArgs: buildClaudeArgsMock,
  callClaude: callClaudeMock,
  ClaudeCliError: class extends Error {
    code = 'UNKNOWN';
  },
}));

vi.mock('../extract-json', () => ({
  extractJson: vi.fn(() => '{"result":"from-result","session_id":"session-abc","duration_ms":15,"total_cost_usd":0.2}'),
}));

vi.mock('../schemas', () => ({
  ClaudeJsonEnvelope: {
    parse: vi.fn((value: unknown) => value),
  },
}));

vi.mock('../parse-sections', () => ({
  parseSections: parseSectionsMock,
}));

vi.mock('../session-jsonl', () => ({
  extractAssistantTexts: extractAssistantTextsMock,
}));

vi.mock('../sessions', () => ({
  readSessions: vi.fn(() => ({})),
  updateSession: updateSessionMock,
}));

vi.mock('../sync', () => ({
  syncToD1: syncToD1Mock,
}));

vi.mock('../parse-cli-usage', () => ({
  parseCliUsage: vi.fn(() => null),
}));

import { runBriefing } from '../run-briefing';

describe('runBriefing fallback chain', () => {
  beforeEach(() => {
    parseSectionsMock.mockReset();
    extractAssistantTextsMock.mockReset();
    callClaudeMock.mockReset();
    buildClaudeArgsMock.mockClear();
    updateSessionMock.mockClear();
    syncToD1Mock.mockClear();
    writeFileSyncMock.mockClear();
    mkdirSyncMock.mockClear();
  });

  it('falls through result -> response -> session JSONL', async () => {
    callClaudeMock.mockResolvedValue('raw-cli-output');
    extractAssistantTextsMock.mockReturnValue(['jsonl-first', 'jsonl-second']);
    parseSectionsMock
      .mockImplementationOnce(() => {
        throw new Error('result parse failed');
      })
      .mockImplementationOnce(() => {
        throw new Error('response parse failed');
      })
      .mockImplementationOnce(() => [])
      .mockImplementationOnce(() => [{ key: 'summary', label: 'Summary', content: 'ok', severity: 'info' }]);

    const result = await runBriefing({ type: 'work' });

    expect(parseSectionsMock).toHaveBeenNthCalledWith(1, 'from-result');
    expect(parseSectionsMock).toHaveBeenNthCalledWith(2, 'raw-cli-output');
    expect(parseSectionsMock).toHaveBeenNthCalledWith(3, 'jsonl-first');
    expect(parseSectionsMock).toHaveBeenNthCalledWith(4, 'jsonl-second');
    expect(extractAssistantTextsMock).toHaveBeenCalledWith('session-abc');
    expect(result.sections).toEqual([
      { key: 'summary', label: 'Summary', content: 'ok', severity: 'info' },
    ]);
    expect(updateSessionMock).toHaveBeenCalled();
    expect(syncToD1Mock).toHaveBeenCalledWith({ briefing: expect.objectContaining({ sections: result.sections }) });
    expect(mkdirSyncMock).toHaveBeenCalled();
    expect(writeFileSyncMock).toHaveBeenCalled();
  });
});
