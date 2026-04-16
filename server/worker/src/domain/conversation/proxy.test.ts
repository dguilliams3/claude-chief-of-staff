import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

vi.mock('./persistence', () => ({
  persistUserMessage: vi.fn(),
  persistUserMessageDirect: vi.fn(),
  preparePersistCompletedAssistantReply: vi.fn(),
  prepareUpdateConversationName: vi.fn(),
  prepareUpdateConversationSessionId: vi.fn(() => []),
}));

vi.mock('../push', () => ({
  sendPushToAll: vi.fn(),
}));

import { proxy } from './proxy';

describe('proxy follow-up status context guard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns JOB_CONTEXT_MISMATCH when client conversationId conflicts with job context', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'job-1',
          status: 'completed',
          sessionId: 'session-1',
          answer: 'answer',
          conversationId: 'authoritative-conversation',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    const env = {
      DB: {} as D1Database,
      TUNNEL_URL: 'http://tunnel.test',
    } as Env;

    const response = await proxy.request(
      '/follow-up/status/job-1?conversationId=client-conversation',
      { method: 'GET' },
      env,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'JOB_CONTEXT_MISMATCH',
    });
  });
});
