/**
 * Tests for the briefing domain API client functions.
 *
 * Tests: `app/src/domain/briefing/api.ts::fetchBriefings`
 * Tests: `app/src/domain/briefing/api.ts::triggerBriefing`
 * Tests: `app/src/domain/briefing/api.ts::fetchTriggerStatus`
 * Tests: `app/src/domain/briefing/api.ts::fetchBriefingList`
 * Tests: `app/src/domain/briefing/api.ts::fetchBriefingById`
 * Tests: `app/src/domain/briefing/api.ts::fetchBriefingTypes`
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setAuthToken } from '@/lib/api';
import {
  fetchBriefings,
  triggerBriefing,
  fetchTriggerStatus,
  fetchBriefingList,
  fetchBriefingById,
  fetchBriefingTypes,
  BriefingError,
} from '@/domain/briefing';
import type { Briefing, BriefingListItem } from '@/domain/briefing';

// ---------- helpers ----------

const API_BASE = 'http://localhost:3141'; // fallback when VITE_API_URL is not set

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorResponse(status: number, body?: unknown): Response {
  return new Response(body ? JSON.stringify(body) : null, { status });
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

const mockListItem: BriefingListItem = {
  id: 'b-001',
  type: 'work',
  generatedAt: '2026-03-12T09:00:00Z',
  sectionCount: 3,
  maxSeverity: 'warn',
  briefingNumber: 1,
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
// fetchBriefings
// ============================================================

describe('fetchBriefings', () => {
  it('returns parsed JSON on 200', async () => {
    const data = { work: mockBriefing };
    fetchSpy.mockResolvedValueOnce(jsonResponse(data));

    const result = await fetchBriefings();
    expect(result).toEqual(data);
  });

  it('throws BriefingError with UNAUTHORIZED on 401', async () => {
    fetchSpy.mockResolvedValueOnce(errorResponse(401));
    try {
      await fetchBriefings();
      expect.unreachable('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(BriefingError);
      expect((err as BriefingError).code).toBe('UNAUTHORIZED');
      expect((err as BriefingError).status).toBe(401);
    }
  });

  it('throws BriefingError on 500 server error', async () => {
    fetchSpy.mockResolvedValueOnce(errorResponse(500));
    fetchSpy.mockResolvedValueOnce(errorResponse(500));
    await expect(fetchBriefings()).rejects.toThrow('API error: 500');
    await expect(fetchBriefings()).rejects.toThrow(BriefingError);
  });

  it('throws on network failure', async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(fetchBriefings()).rejects.toThrow('Failed to fetch');
  });

  it('calls the correct URL', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({}));
    await fetchBriefings();
    expect(fetchSpy).toHaveBeenCalledWith(
      `${API_BASE}/briefings/latest`,
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });
});

// ============================================================
// triggerBriefing
// ============================================================

describe('triggerBriefing', () => {
  it('returns status, type, and jobId on success', async () => {
    const body = { status: 'running', type: 'work', jobId: 'job-123' };
    fetchSpy.mockResolvedValueOnce(jsonResponse(body));

    const result = await triggerBriefing({ type: 'work' });
    expect(result).toEqual(body);
  });

  it('sends POST with type in body', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ status: 'running', type: 'news', jobId: 'job-456' }));
    await triggerBriefing({ type: 'news' });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${API_BASE}/briefings/trigger`);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ type: 'news' });
  });

  it('throws BriefingError with TRIGGER_FAILED on non-200', async () => {
    fetchSpy.mockResolvedValueOnce(errorResponse(403));
    await expect(triggerBriefing({ type: 'work' })).rejects.toThrow(BriefingError);
  });
});

// ============================================================
// fetchTriggerStatus
// ============================================================

describe('fetchTriggerStatus', () => {
  it('returns job status on success', async () => {
    const body = { id: 'job-1', type: 'work', status: 'running' };
    fetchSpy.mockResolvedValueOnce(jsonResponse(body));

    const result = await fetchTriggerStatus({ jobId: 'job-1' });
    expect(result).toEqual(body);
  });

  it('sends GET to /briefings/status/:jobId', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ id: 'job-1', type: 'work', status: 'completed', briefingId: 'b-001' }));
    await fetchTriggerStatus({ jobId: 'job-1' });

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${API_BASE}/briefings/status/job-1`);
  });

  it('throws BriefingError with STATUS_CHECK_FAILED on non-200', async () => {
    fetchSpy.mockResolvedValueOnce(errorResponse(404));
    await expect(fetchTriggerStatus({ jobId: 'expired' })).rejects.toThrow(BriefingError);
  });
});

// ============================================================
// fetchBriefingList
// ============================================================

describe('fetchBriefingList', () => {
  it('returns array of BriefingListItem', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse([mockListItem]));
    const result = await fetchBriefingList();
    expect(result).toEqual([mockListItem]);
  });

  it('returns empty array when no briefings', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse([]));
    const result = await fetchBriefingList();
    expect(result).toEqual([]);
  });

  it('throws BriefingError on 401', async () => {
    fetchSpy.mockResolvedValueOnce(errorResponse(401));
    await expect(fetchBriefingList()).rejects.toThrow(BriefingError);
  });
});

// ============================================================
// fetchBriefingById
// ============================================================

describe('fetchBriefingById', () => {
  it('returns full Briefing', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(mockBriefing));
    const result = await fetchBriefingById({ id: 'b-001' });
    expect(result).toEqual(mockBriefing);
  });

  it('URL-encodes the briefing ID', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(mockBriefing));
    await fetchBriefingById({ id: 'id with spaces/slashes' });
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain(encodeURIComponent('id with spaces/slashes'));
  });

  it('throws BriefingError with NOT_FOUND on 404', async () => {
    fetchSpy.mockResolvedValueOnce(errorResponse(404));
    await expect(fetchBriefingById({ id: 'missing' })).rejects.toThrow(BriefingError);
  });
});

// ============================================================
// fetchBriefingTypes
// ============================================================

describe('fetchBriefingTypes', () => {
  it('unwraps the types array from { types: [...] } envelope', async () => {
    const types = [
      { key: 'work', label: 'Work', description: 'Operational work briefing' },
      { key: 'news', label: 'News', description: 'AI landscape news briefing' },
    ];
    fetchSpy.mockResolvedValueOnce(jsonResponse({ types }));

    const result = await fetchBriefingTypes();
    expect(result).toEqual(types);
  });

  it('throws BriefingError on non-200', async () => {
    fetchSpy.mockResolvedValueOnce(errorResponse(500));
    await expect(fetchBriefingTypes()).rejects.toThrow(BriefingError);
  });
});
