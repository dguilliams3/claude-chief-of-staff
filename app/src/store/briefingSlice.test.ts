/**
 * Tests for the Zustand briefing slice -- data fetching, trigger/polling, history, selection.
 *
 * Tests: app/src/store/briefingSlice.ts::createBriefingSlice
 * Tests: app/src/store/briefingSlice.ts::BriefingSlice (interface exercised through actions)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createBriefingSlice } from '@/store/briefingSlice';
import type { BriefingSlice } from '@/store/briefingSlice';
import type { Briefing, BriefingListItem } from '@/domain/briefing';

// ---------- mocks ----------

vi.mock('@/domain/briefing', () => ({
  fetchBriefings: vi.fn(),
  triggerBriefing: vi.fn(),
  fetchTriggerStatus: vi.fn(),
  fetchBriefingList: vi.fn(),
  fetchBriefingById: vi.fn(),
}));

// Mock the polling module — we control poll lifecycle in tests
vi.mock('@/lib/polling', () => {
  // Capture the most recent pollForResult call for test assertions
  let lastPollCall: {
    options: { pollKey: string; startedAt: number };
    callbacks: {
      onComplete: (job: unknown) => void;
      onFailed: (error: string) => void;
      onTimeout: () => void;
      onTerminalError: (error: string) => void;
    };
    fetchStatus: (signal: AbortSignal) => Promise<unknown>;
  } | null = null;

  return {
    pollForResult: vi.fn((options, callbacks, fetchStatus) => {
      lastPollCall = { options, callbacks, fetchStatus };
    }),
    stopPolling: vi.fn(),
    stopAllPolling: vi.fn(),
    // Test helper to access the last pollForResult call
    __getLastPollCall: () => lastPollCall,
    __clearLastPollCall: () => { lastPollCall = null; },
  };
});

import {
  fetchBriefings,
  triggerBriefing as apiTrigger,
  fetchTriggerStatus,
  fetchBriefingList,
  fetchBriefingById,
} from '@/domain/briefing';

import { pollForResult, stopPolling } from '@/lib/polling';

const mockFetchBriefings = vi.mocked(fetchBriefings);
const mockApiTrigger = vi.mocked(apiTrigger);
const mockFetchTriggerStatus = vi.mocked(fetchTriggerStatus);
const mockFetchBriefingList = vi.mocked(fetchBriefingList);
const mockFetchBriefingById = vi.mocked(fetchBriefingById);
const mockPollForResult = vi.mocked(pollForResult);
const mockStopPolling = vi.mocked(stopPolling);

// Access internal test helper
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const polling = await import('@/lib/polling') as any;

// ---------- fixtures ----------

const mockBriefing: Briefing = {
  id: 'b-001',
  type: 'work',
  generatedAt: '2026-03-12T09:00:00Z',
  sessionId: 'sess-001',
  sections: [{ key: 'S1', label: 'Section', content: 'content', severity: 'info' }],
  metadata: {
    sourcesSampled: ['jira'],
    runDurationMs: 10000,
    costUsd: 0.03,
    sessionResumed: false,
    briefingNumber: 1,
  },
};

const mockListItem: BriefingListItem = {
  id: 'b-001',
  type: 'work',
  generatedAt: '2026-03-12T09:00:00Z',
  sectionCount: 3,
  maxSeverity: 'info',
  briefingNumber: 1,
};

// ---------- helper: create a slice with get/set wiring ----------

function createTestSlice() {
  let state: BriefingSlice;
  const set = (partial: Partial<BriefingSlice>) => {
    state = { ...state, ...partial };
  };
  const get = () => state;
  state = createBriefingSlice(set, get);
  return { get, set: set as (p: Partial<BriefingSlice>) => void };
}

// ---------- setup ----------

beforeEach(() => {
  vi.clearAllMocks();
  polling.__clearLastPollCall();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================
// Initial state
// ============================================================

describe('initial state', () => {
  it('starts with loading=true and empty briefings', () => {
    const { get } = createTestSlice();
    expect(get().loading).toBe(true);
    expect(get().briefings).toEqual({});
  });

  it('has sensible defaults', () => {
    const { get } = createTestSlice();
    expect(get().activeType).toBe('work');
    expect(get().activeTrigger).toBeNull();
    expect(get().historyList).toEqual([]);
    expect(get().selectedBriefingId).toBeNull();
    expect(get().selectedBriefing).toBeNull();
  });
});

// ============================================================
// setActiveType
// ============================================================

describe('setActiveType', () => {
  it('updates activeType', () => {
    const { get } = createTestSlice();
    get().setActiveType({ type: 'news' });
    expect(get().activeType).toBe('news');
  });
});

// ============================================================
// refresh / silentRefresh
// ============================================================

describe('refresh', () => {
  it('sets loading=true then false, updates briefings', async () => {
    mockFetchBriefings.mockResolvedValueOnce({ work: mockBriefing });
    const { get } = createTestSlice();

    await get().refresh();
    expect(get().briefings).toEqual({ work: mockBriefing });
    expect(get().loading).toBe(false);
  });

  it('sets loading=false even on failure, leaves old briefings intact', async () => {
    mockFetchBriefings.mockRejectedValueOnce(new Error('down'));
    const { get, set } = createTestSlice();
    set({ briefings: { work: mockBriefing } });

    await get().refresh();
    expect(get().loading).toBe(false);
    expect(get().briefings).toEqual({ work: mockBriefing }); // stale data preserved
  });
});

describe('silentRefresh', () => {
  it('updates briefings without toggling loading', async () => {
    mockFetchBriefings.mockResolvedValueOnce({ news: mockBriefing });
    const { get, set } = createTestSlice();
    set({ loading: false });

    await get().silentRefresh();
    expect(get().briefings).toEqual({ news: mockBriefing });
  });
});

// ============================================================
// triggerBriefing + polling via pollForResult
// ============================================================

describe('triggerBriefing', () => {
  it('sets activeTrigger with jobId and calls API', async () => {
    mockApiTrigger.mockResolvedValueOnce({ status: 'running', type: 'work', jobId: 'job-1' });

    const { get } = createTestSlice();
    get().setActiveType({ type: 'work' });

    await get().triggerBriefing();

    expect(mockApiTrigger).toHaveBeenCalledWith({ type: 'work' });
    expect(get().activeTrigger).not.toBeNull();
    expect(get().activeTrigger?.type).toBe('work');
    expect(get().activeTrigger?.jobId).toBe('job-1');
  });

  it('calls pollForResult with correct poll key', async () => {
    mockApiTrigger.mockResolvedValueOnce({ status: 'running', type: 'work', jobId: 'job-1' });

    const { get } = createTestSlice();
    await get().triggerBriefing();

    expect(mockPollForResult).toHaveBeenCalledTimes(1);
    const callArgs = mockPollForResult.mock.calls[0];
    expect(callArgs[0].pollKey).toBe('briefing-trigger');
  });

  it('stops existing poll before starting new one', async () => {
    mockApiTrigger.mockResolvedValueOnce({ status: 'running', type: 'work', jobId: 'job-1' });

    const { get } = createTestSlice();
    await get().triggerBriefing();

    expect(mockStopPolling).toHaveBeenCalledWith('briefing-trigger');
  });

  it('no-ops if a trigger is already active', async () => {
    const { get, set } = createTestSlice();
    set({ activeTrigger: { type: 'work', triggerStart: Date.now(), jobId: 'job-existing' } });

    await get().triggerBriefing();
    expect(mockApiTrigger).not.toHaveBeenCalled();
  });

  it('clears activeTrigger on API failure', async () => {
    mockApiTrigger.mockRejectedValueOnce(new Error('tunnel down'));
    const { get } = createTestSlice();

    await get().triggerBriefing();
    expect(get().activeTrigger).toBeNull();
  });

  it('clears activeTrigger when pollForResult calls onComplete', async () => {
    mockApiTrigger.mockResolvedValueOnce({ status: 'running', type: 'work', jobId: 'job-1' });
    mockFetchBriefings.mockResolvedValue({ work: { ...mockBriefing, id: 'b-002' } });

    const { get } = createTestSlice();
    await get().triggerBriefing();

    // Simulate pollForResult calling onComplete
    const lastPoll = polling.__getLastPollCall();
    await lastPoll.callbacks.onComplete({ status: 'completed' });

    expect(get().activeTrigger).toBeNull();
    expect(mockFetchBriefings).toHaveBeenCalled(); // silentRefresh called in onComplete
  });

  it('clears activeTrigger when pollForResult calls onFailed', async () => {
    mockApiTrigger.mockResolvedValueOnce({ status: 'running', type: 'work', jobId: 'job-1' });

    const { get } = createTestSlice();
    await get().triggerBriefing();

    const lastPoll = polling.__getLastPollCall();
    lastPoll.callbacks.onFailed('Claude CLI timeout');

    expect(get().activeTrigger).toBeNull();
  });

  it('clears activeTrigger when pollForResult calls onTimeout', async () => {
    mockApiTrigger.mockResolvedValueOnce({ status: 'running', type: 'work', jobId: 'job-1' });

    const { get } = createTestSlice();
    await get().triggerBriefing();

    const lastPoll = polling.__getLastPollCall();
    lastPoll.callbacks.onTimeout();

    expect(get().activeTrigger).toBeNull();
  });

  it('clears activeTrigger when pollForResult calls onTerminalError', async () => {
    mockApiTrigger.mockResolvedValueOnce({ status: 'running', type: 'work', jobId: 'job-1' });

    const { get } = createTestSlice();
    await get().triggerBriefing();

    const lastPoll = polling.__getLastPollCall();
    lastPoll.callbacks.onTerminalError('Server restarted');

    expect(get().activeTrigger).toBeNull();
  });

  it('fetchStatus falls through to silentRefresh when status endpoint fails', async () => {
    mockApiTrigger.mockResolvedValueOnce({ status: 'running', type: 'work', jobId: 'job-1' });
    mockFetchTriggerStatus.mockRejectedValueOnce(new Error('tunnel down'));
    mockFetchBriefings.mockResolvedValue({ work: mockBriefing });

    const { get } = createTestSlice();
    await get().triggerBriefing();

    const lastPoll = polling.__getLastPollCall();
    const controller = new AbortController();
    const result = await lastPoll.fetchStatus(controller.signal);

    // Should return 'running' so polling continues
    expect(result).toEqual({ status: 'running' });
    // silentRefresh should have been called as fallback
    expect(mockFetchBriefings).toHaveBeenCalled();
  });

  it('fetchStatus returns job status on success', async () => {
    const jobStatus = { id: 'job-1', type: 'work', status: 'completed' as const, briefingId: 'b-002' };
    mockApiTrigger.mockResolvedValueOnce({ status: 'running', type: 'work', jobId: 'job-1' });
    mockFetchTriggerStatus.mockResolvedValueOnce(jobStatus);

    const { get } = createTestSlice();
    await get().triggerBriefing();

    const lastPoll = polling.__getLastPollCall();
    const controller = new AbortController();
    const result = await lastPoll.fetchStatus(controller.signal);

    expect(result).toEqual(jobStatus);
  });

  it('fetchStatus re-throws 404 errors for terminal detection', async () => {
    mockApiTrigger.mockResolvedValueOnce({ status: 'running', type: 'work', jobId: 'job-1' });
    // BriefingError with 404 in message — pollForResult checks message.includes('404')
    mockFetchTriggerStatus.mockRejectedValueOnce(new Error('Status check failed: 404'));

    const { get } = createTestSlice();
    await get().triggerBriefing();

    const lastPoll = polling.__getLastPollCall();
    const controller = new AbortController();

    // fetchStatus callback should re-throw 404 errors (not swallow them)
    await expect(lastPoll.fetchStatus(controller.signal)).rejects.toThrow('404');
  });
});

describe('cancelTrigger', () => {
  it('calls stopPolling and clears activeTrigger', () => {
    const { get, set } = createTestSlice();
    set({ activeTrigger: { type: 'work', triggerStart: Date.now(), jobId: 'job-existing' } });
    get().cancelTrigger();
    expect(get().activeTrigger).toBeNull();
    expect(mockStopPolling).toHaveBeenCalledWith('briefing-trigger');
  });
});

// ============================================================
// fetchHistory
// ============================================================

describe('fetchHistory', () => {
  it('sets historyList on success', async () => {
    mockFetchBriefingList.mockResolvedValueOnce([mockListItem]);

    const { get } = createTestSlice();
    await get().fetchHistory();

    expect(get().historyList).toEqual([mockListItem]);
    expect(get().historyLoading).toBe(false);
  });

  it('clears historyLoading on failure', async () => {
    mockFetchBriefingList.mockRejectedValueOnce(new Error('down'));

    const { get } = createTestSlice();
    await get().fetchHistory();
    expect(get().historyLoading).toBe(false);
  });
});

// ============================================================
// selectBriefing
// ============================================================

describe('selectBriefing', () => {
  it('fetches and sets briefing by ID', async () => {
    mockFetchBriefingById.mockResolvedValueOnce(mockBriefing);

    const { get } = createTestSlice();
    await get().selectBriefing({ id: 'b-001' });

    expect(get().selectedBriefingId).toBe('b-001');
    expect(get().selectedBriefing).toEqual(mockBriefing);
  });

  it('clears selection when id is null', async () => {
    const { get, set } = createTestSlice();
    set({ selectedBriefingId: 'b-001', selectedBriefing: mockBriefing });

    await get().selectBriefing({ id: null });
    expect(get().selectedBriefingId).toBeNull();
    expect(get().selectedBriefing).toBeNull();
  });

  it('clears selectedBriefingId on fetch failure', async () => {
    mockFetchBriefingById.mockRejectedValueOnce(new Error('404'));

    const { get } = createTestSlice();
    await get().selectBriefing({ id: 'bad-id' });
    expect(get().selectedBriefingId).toBeNull();
  });
});
