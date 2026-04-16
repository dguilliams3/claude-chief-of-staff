import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TEST_DIR, '../../../../../');
const OVERRIDE_PATH = resolve(REPO_ROOT, 'local/chat-system-prompt.md');
const DEFAULT_PATH = resolve(REPO_ROOT, 'agent/prompts/chat-system-prompt.md');

const { buildClaudeArgsMock, callClaudeMock } = vi.hoisted(() => {
  return {
    buildClaudeArgsMock: vi.fn((options: { system: string }) => ['--mock-arg', options.system]),
    callClaudeMock: vi.fn(async () => JSON.stringify({ result: 'ok', session_id: 'sid-1' })),
  };
});

vi.mock('../../../../../agent/claude-cli', () => {
  class ClaudeCliError extends Error {
    code = 'UNKNOWN';
  }

  return {
    buildClaudeArgs: buildClaudeArgsMock,
    callClaude: callClaudeMock,
    ClaudeCliError,
  };
});

vi.mock('../../../../../agent/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../followUpQueue', () => ({
  enqueueFollowUp: vi.fn((lockKey: string, sessionId: string) => ({ id: `${lockKey}-job`, sessionId })),
  completeFollowUp: vi.fn(),
  failFollowUp: vi.fn(),
  getFollowUpJob: vi.fn(() => null),
}));

vi.mock('../../briefing', () => ({
  createBriefingTriggerRoutes: vi.fn(() => new Hono()),
}));

vi.mock('../../../../../agent/parse-cli-usage', () => ({
  parseCliUsage: vi.fn(() => null),
}));

afterEach(() => {
  rmSync(OVERRIDE_PATH, { force: true });
  buildClaudeArgsMock.mockClear();
  callClaudeMock.mockClear();
});

async function invokeFollowUpRoute(): Promise<string> {
  const { createClaudeRoutes } = await import('../routes');
  const app = createClaudeRoutes();

  const response = await app.request('/follow-up', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question: 'hello', newSession: true }),
  });

  expect(response.status).toBe(202);

  await new Promise(resolvePromise => setTimeout(resolvePromise, 0));

  const lastCall = buildClaudeArgsMock.mock.calls.at(-1);
  const options = (lastCall?.[0] as { system?: string } | undefined) ?? undefined;
  expect(options?.system).toBeDefined();
  return options?.system ?? '';
}

describe('getChatSystemPrompt live getter behavior', () => {
  it('returns tracked default when local override is absent', async () => {
    rmSync(OVERRIDE_PATH, { force: true });
    const expectedDefault = readFileSync(DEFAULT_PATH, 'utf-8');

    const systemPrompt = await invokeFollowUpRoute();

    expect(systemPrompt).toBe(expectedDefault);
  });

  it('returns local override when present', async () => {
    writeFileSync(OVERRIDE_PATH, '  local override prompt  \n', 'utf-8');

    const systemPrompt = await invokeFollowUpRoute();

    expect(systemPrompt).toBe('local override prompt');
  });

  it('re-reads local override between calls (not cached)', async () => {
    writeFileSync(OVERRIDE_PATH, 'first override', 'utf-8');
    const first = await invokeFollowUpRoute();

    writeFileSync(OVERRIDE_PATH, 'second override', 'utf-8');
    const second = await invokeFollowUpRoute();

    expect(first).toBe('first override');
    expect(second).toBe('second override');
  });
});
