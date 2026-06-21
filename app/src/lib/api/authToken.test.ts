/**
 * Tests for auth token management and request header construction.
 *
 * Tests: `app/src/lib/api/authToken.ts::setAuthToken`
 * Tests: `app/src/lib/api/headers.ts::headers`
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setAuthToken } from '@/lib/api';
import { fetchBriefings } from '@/domain/briefing';
import type { Briefing } from '@/domain/briefing';

// ---------- helpers ----------

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const mockBriefing: Briefing = {
  id: 'b-001',
  type: 'work',
  generatedAt: '2026-03-12T09:00:00Z',
  sessionId: 'sess-001',
  sections: [
    { key: 'S1', label: 'Section 1', content: '# Heading', severity: 'info' },
  ],
  metadata: {
    sourcesSampled: ['jira'],
    runDurationMs: 12000,
    costUsd: 0.04,
    sessionResumed: false,
    briefingNumber: 1,
  },
};

// ---------- setup ----------

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch');
  setAuthToken(''); // reset between tests
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================
// setAuthToken / headers
// ============================================================

describe('setAuthToken / headers', () => {
  it('sends no Authorization header when token is empty', async () => {
    setAuthToken('');
    fetchSpy.mockResolvedValueOnce(jsonResponse({ work: mockBriefing }));

    await fetchBriefings();

    const [, init] = fetchSpy.mock.calls[0];
    const headers = init?.headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('sends Bearer token when set', async () => {
    setAuthToken('my-secret');
    fetchSpy.mockResolvedValueOnce(jsonResponse({ work: mockBriefing }));

    await fetchBriefings();

    const [, init] = fetchSpy.mock.calls[0];
    const headers = init?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer my-secret');
  });

  it('clears token when set to empty string', async () => {
    setAuthToken('first');
    setAuthToken('');
    fetchSpy.mockResolvedValueOnce(jsonResponse({ work: mockBriefing }));

    await fetchBriefings();

    const [, init] = fetchSpy.mock.calls[0];
    const headers = init?.headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
  });
});
