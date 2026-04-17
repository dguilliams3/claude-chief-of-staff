/**
 * Tests: `agent/sync.ts::syncToD1`
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { infoMock, warnMock } = vi.hoisted(() => ({
  infoMock: vi.fn(),
  warnMock: vi.fn(),
}));

vi.mock('../logger', () => ({
  logger: {
    info: infoMock,
    warn: warnMock,
  },
}));

import { syncToD1 } from '../sync';

describe('syncToD1', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    infoMock.mockReset();
    warnMock.mockReset();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it('warns and returns when worker URL is missing', async () => {
    delete process.env.COS_WORKER_URL;
    process.env.COS_TOKEN = 'token';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await syncToD1({ briefing: { id: 'b1' } });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnMock).toHaveBeenCalledWith(
      'COS_WORKER_URL not set, skipping D1 sync',
    );
  });

  it('skips sync and warns when token is missing', async () => {
    process.env.COS_WORKER_URL = 'https://example.workers.dev';
    delete process.env.COS_TOKEN;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await syncToD1({ briefing: { id: 'b2' } });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnMock).toHaveBeenCalledWith('COS_TOKEN not set, skipping D1 sync');
  });

  it('posts briefing payload and logs success on valid response', async () => {
    process.env.COS_WORKER_URL = 'https://example.workers.dev';
    process.env.COS_TOKEN = 'token-123';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ status: 'ok', id: 'abc' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await syncToD1({ briefing: { id: 'b3', type: 'work' } });

    expect(fetchMock).toHaveBeenCalledWith('https://example.workers.dev/briefings/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-123',
      },
      body: JSON.stringify({ id: 'b3', type: 'work' }),
      signal: expect.any(AbortSignal),
    });
    expect(infoMock).toHaveBeenCalledWith({ status: 'ok', id: 'abc' }, 'Synced to D1');
  });

  it('logs warning when response is not ok', async () => {
    process.env.COS_WORKER_URL = 'https://example.workers.dev';
    process.env.COS_TOKEN = 'token-err';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: vi.fn().mockResolvedValue('unauthorized'),
    }));

    await syncToD1({ briefing: { id: 'b5' } });

    expect(warnMock).toHaveBeenCalledWith(
      { status: 401, statusText: undefined },
      'D1 sync returned non-OK status',
    );
    expect(infoMock).not.toHaveBeenCalled();
  });

  it('logs a non-fatal warning when fetch fails', async () => {
    process.env.COS_WORKER_URL = 'https://example.workers.dev';
    process.env.COS_TOKEN = 'token-xyz';
    const error = new Error('network down');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error));

    await expect(syncToD1({ briefing: { id: 'b4' } })).resolves.toBeUndefined();
    expect(warnMock).toHaveBeenCalledWith({ err: error }, 'D1 sync failed (non-fatal)');
  });
});
