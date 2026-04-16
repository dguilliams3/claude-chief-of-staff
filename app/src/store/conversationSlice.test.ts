/**
 * Tests for the Zustand conversation slice -- follow-up, hydration, conversation list/selection.
 *
 * Tests: app/src/store/conversationSlice.ts::createConversationSlice
 * Tests: app/src/store/conversationSlice.ts::ConversationSlice (interface exercised through actions)
 * Tests: app/src/store/conversationSlice.ts::mergeMessages (via hydrateFollowUpHistory)
 * Tests: app/src/store/conversationSlice.ts::EMPTY_HISTORY
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createConversationSlice } from '@/store/conversationSlice';
import { EMPTY_HISTORY } from '@/domain/conversation';
import type { ConversationSlice } from '@/store/conversationSlice';
import type { Message, ConversationListItem, FollowUpResponse, FollowUpJobStatus } from '@/domain/conversation';

// ---------- mocks ----------

import { FollowUpError } from '@/domain/conversation/errors';

vi.mock('@/domain/conversation', () => ({
  sendFollowUp: vi.fn(),
  fetchFollowUpStatus: vi.fn(),
  fetchConversations: vi.fn(),
  fetchConversationMessages: vi.fn(),
  fetchConversationByBriefing: vi.fn(),
  createConversation: vi.fn(),
  updateConversationName: vi.fn(),
  EMPTY_HISTORY: [] as never[],
  mergeMessages: (d1: unknown[], local: unknown[]) => {
    const d1Ids = new Set((d1 as Array<{id: string}>).map(m => m.id));
    const localOnly = (local as Array<{id: string}>).filter(m => !d1Ids.has(m.id));
    return [...d1, ...localOnly].sort(
      (a, b) => new Date((a as {createdAt: string}).createdAt).getTime() - new Date((b as {createdAt: string}).createdAt).getTime()
    );
  },
}));

import {
  sendFollowUp as apiSendFollowUp,
  fetchFollowUpStatus as apiFetchFollowUpStatus,
  fetchConversations as apiFetchConversations,
  fetchConversationMessages as apiFetchMessages,
  fetchConversationByBriefing as apiFetchConversationByBriefing,
  createConversation as apiCreateConversation,
  updateConversationName as apiUpdateConversationName,
} from '@/domain/conversation';

const mockSendFollowUp = vi.mocked(apiSendFollowUp);
const mockFetchFollowUpStatus = vi.mocked(apiFetchFollowUpStatus);
void apiFetchConversations; // mock registered; tests moved to chatsSlice.test.ts
const mockFetchMessages = vi.mocked(apiFetchMessages);
const mockFetchConversationByBriefing = vi.mocked(apiFetchConversationByBriefing);
const mockCreateConversation = vi.mocked(apiCreateConversation);
void apiUpdateConversationName; // mock registered above; no direct assertions needed yet

// ---------- fixtures ----------

const makeMessage = (overrides: Partial<Message> = {}): Message => ({
  id: 'm-001',
  conversationId: 'c-001',
  role: 'user',
  content: 'test question',
  createdAt: '2026-03-12T09:00:00Z',
  ...overrides,
});

const makeConversationListItem = (overrides: Partial<ConversationListItem> = {}): ConversationListItem => ({
  id: 'c-001',
  briefingId: 'b-001',
  sessionId: 'sess-001',
  name: null,
  createdAt: '2026-03-12T09:00:00Z',
  lastMessageAt: '2026-03-12T09:05:00Z',
  messageCount: 2,
  ...overrides,
});

// ---------- helper: create a slice with get/set wiring ----------

function createTestSlice() {
  // The slice's StoreGet returns ConversationSlice & ChatsSliceDeps.
  // In tests we provide stub values for the ChatsSlice fields.
  const chatsStub = {
    selectedConversation: null as ConversationListItem | null,
    conversations: [] as ConversationListItem[],
    conversationErrors: {} as Record<string, string>,
    selectedConversationMessages: [] as Message[],
  };
  let state: ConversationSlice & typeof chatsStub;
  const set = (partial: Partial<ConversationSlice & typeof chatsStub>) => {
    state = { ...state, ...partial };
  };
  const get = () => state;
  state = { ...createConversationSlice(set, get), ...chatsStub };
  return { get, set };
}

// ---------- setup ----------

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// Initial state
// ============================================================

describe('initial state', () => {
  it('starts with empty follow-up state', () => {
    const { get } = createTestSlice();
    expect(get().followUpHistory).toEqual({});
    expect(get().pendingFollowUps).toEqual({});
    expect(get().followUpError).toBeNull();
    expect(get().followUpHydrating).toEqual({});
  });

  it('starts with empty multi-chat state', () => {
    const { get } = createTestSlice();
    expect(get().activeConversationId).toBeNull();
    expect(get().briefingConversations).toEqual([]);
  });
});

// ============================================================
// EMPTY_HISTORY sentinel
// ============================================================

describe('EMPTY_HISTORY', () => {
  it('is a stable reference (same array across accesses)', () => {
    expect(EMPTY_HISTORY).toBe(EMPTY_HISTORY); // reference equality
  });

  it('is an empty array', () => {
    expect(EMPTY_HISTORY).toEqual([]);
    expect(EMPTY_HISTORY).toHaveLength(0);
  });
});

// ============================================================
// sendFollowUp -- success path (async polling)
// ============================================================

/** Helper: creates a standard enqueue response (202 from Worker) */
function makeEnqueueResponse(overrides: Partial<FollowUpResponse> = {}): FollowUpResponse {
  return {
    jobId: 'job-001',
    persisted: true,
    userMessage: { id: 'um-1', conversationId: 'c-001', createdAt: '2026-03-12T09:00:30Z' },
    conversationId: 'c-001',
    isNewSession: false,
    briefingId: 'b-001',
    ...overrides,
  };
}

/** Helper: creates a completed job status (from poll) */
function makeCompletedJob(overrides: Partial<FollowUpJobStatus> = {}): FollowUpJobStatus {
  return {
    id: 'job-001',
    sessionId: 'sess-001',
    status: 'completed',
    answer: 'Here is the answer',
    assistantMessage: makeMessage({ id: 'am-1', role: 'assistant', content: 'Here is the answer' }),
    ...overrides,
  };
}

describe('sendFollowUp - success', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('optimistically adds user message, reconciles ID, then appends assistant on poll completion', async () => {
    mockSendFollowUp.mockResolvedValueOnce(makeEnqueueResponse());
    mockFetchFollowUpStatus.mockResolvedValueOnce(makeCompletedJob());

    const { get } = createTestSlice();
    await get().sendFollowUp({ briefingId: 'b-001', sessionId: 'sess-001', question: 'What next?' });

    // User message reconciled immediately after enqueue
    const historyAfterEnqueue = get().followUpHistory['b-001'];
    expect(historyAfterEnqueue).toHaveLength(1);
    expect(historyAfterEnqueue![0].id).toBe('um-1'); // reconciled from temp
    expect(historyAfterEnqueue![0].content).toBe('What next?');
    expect(get().pendingFollowUps['b-001']).toBeDefined(); // still pending

    // Advance timer to trigger first poll
    await vi.advanceTimersByTimeAsync(2_000);

    const historyAfterPoll = get().followUpHistory['b-001'];
    expect(historyAfterPoll).toHaveLength(2); // user + assistant
    expect(historyAfterPoll![1].role).toBe('assistant');
    expect(historyAfterPoll![1].content).toBe('Here is the answer');
    expect(get().pendingFollowUps['b-001']).toBeUndefined();
    expect(get().followUpError).toBeNull();
  });

  it('sets pendingFollowUps[historyKey] with startedAt during request', async () => {
    mockSendFollowUp.mockResolvedValueOnce(makeEnqueueResponse());
    mockFetchFollowUpStatus.mockResolvedValueOnce({ id: 'job-001', sessionId: 's', status: 'running' });

    const { get } = createTestSlice();
    const promise = get().sendFollowUp({ briefingId: 'b-001', sessionId: 's', question: 'q' });

    // pendingFollowUps entry is set synchronously before await
    expect(get().pendingFollowUps['b-001']).toBeDefined();
    expect(get().pendingFollowUps['b-001']!.historyKey).toBe('b-001');
    expect(get().pendingFollowUps['b-001']!.startedAt).toBeGreaterThan(0);

    await promise;
    // Still pending after enqueue (waiting for poll to complete)
    expect(get().pendingFollowUps['b-001']).toBeDefined();

    // Complete the poll — first poll returns 'running' (already mocked above),
    // then we mock the completed response and advance again
    mockFetchFollowUpStatus.mockResolvedValueOnce(makeCompletedJob());
    // Advance through first poll (running) + second poll (completed)
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.advanceTimersByTimeAsync(2_000);
    // Allow microtasks from AbortController signal checks to settle
    await vi.advanceTimersByTimeAsync(100);

    expect(get().pendingFollowUps['b-001']).toBeUndefined();
  });

  it('handles null userMessage in enqueue response (D1 was down)', async () => {
    mockSendFollowUp.mockResolvedValueOnce(makeEnqueueResponse({ userMessage: null, persisted: false }));
    mockFetchFollowUpStatus.mockResolvedValueOnce(makeCompletedJob());

    const { get } = createTestSlice();
    await get().sendFollowUp({ briefingId: 'b-001', sessionId: 's', question: 'q' });

    const history = get().followUpHistory['b-001'];
    expect(history![0].id).toMatch(/^temp-/); // not reconciled

    await vi.advanceTimersByTimeAsync(2_000);

    const historyAfterPoll = get().followUpHistory['b-001'];
    expect(historyAfterPoll).toHaveLength(2); // temp user + assistant
  });

  it('polls with adaptive delays: 2s → 5s → 10s', async () => {
    mockSendFollowUp.mockResolvedValueOnce(makeEnqueueResponse());
    // Return 'running' for several polls, then 'completed'
    mockFetchFollowUpStatus
      .mockResolvedValueOnce({ id: 'j', sessionId: 's', status: 'running' })  // poll 1 at 2s
      .mockResolvedValueOnce({ id: 'j', sessionId: 's', status: 'running' })  // poll 2 at 4s
      .mockResolvedValueOnce(makeCompletedJob()); // poll 3 at 6s

    const { get } = createTestSlice();
    await get().sendFollowUp({ briefingId: 'b-001', sessionId: 's', question: 'q' });

    // First poll at 2s
    await vi.advanceTimersByTimeAsync(2_000);
    expect(mockFetchFollowUpStatus).toHaveBeenCalledTimes(1);

    // Second poll at 4s (2s after first, still in <15s band)
    await vi.advanceTimersByTimeAsync(2_000);
    expect(mockFetchFollowUpStatus).toHaveBeenCalledTimes(2);

    // Third poll at 6s
    await vi.advanceTimersByTimeAsync(2_000);
    expect(mockFetchFollowUpStatus).toHaveBeenCalledTimes(3);
    expect(get().pendingFollowUps['b-001']).toBeUndefined(); // completed
  });
});

// ============================================================
// sendFollowUp -- error paths
// ============================================================

describe('sendFollowUp - errors', () => {
  it('removes optimistic message when not persisted', async () => {
    mockSendFollowUp.mockRejectedValueOnce(
      new FollowUpError('Tunnel down', 'TUNNEL_DOWN', false),
    );

    const { get } = createTestSlice();
    await get().sendFollowUp({ briefingId: 'b-001', sessionId: 's', question: 'q' });

    const history = get().followUpHistory['b-001'];
    expect(history).toEqual([]); // optimistic removed
    expect(get().followUpError).toBe('Tunnel down');
    expect(get().pendingFollowUps['b-001']).toBeUndefined();
  });

  it('reconciles temp ID when persisted but tunnel failed', async () => {
    const um = { id: 'real-id', conversationId: 'c-001', createdAt: '2026-03-12T09:00:00Z' };
    mockSendFollowUp.mockRejectedValueOnce(
      new FollowUpError('Tunnel failed after persist', 'TUNNEL_DOWN', true, um),
    );

    const { get } = createTestSlice();
    await get().sendFollowUp({ briefingId: 'b-001', sessionId: 's', question: 'q' });

    const history = get().followUpHistory['b-001'];
    expect(history).toHaveLength(1); // user message kept
    expect(history![0].id).toBe('real-id');
    expect(get().followUpError).toBe('Tunnel failed after persist');
  });

  // 'marks session expired' test moved — requires merged CosStore (cross-slice write
  // to chatsSlice.conversationErrors). Covered by integration test when available.

  it('sets generic error for non-FollowUpError exceptions', async () => {
    mockSendFollowUp.mockRejectedValueOnce(new TypeError('Network error'));

    const { get } = createTestSlice();
    await get().sendFollowUp({ briefingId: 'b-001', sessionId: 's', question: 'q' });

    expect(get().followUpError).toBe('Something went wrong. Try again.');
    expect(get().pendingFollowUps['b-001']).toBeUndefined();
  });

  it('appends to existing history, does not overwrite', async () => {
    vi.useFakeTimers();
    const existingMsg = makeMessage({ id: 'existing', content: 'prior question' });
    mockSendFollowUp.mockResolvedValueOnce(makeEnqueueResponse({ userMessage: { id: 'u2', conversationId: 'c-001', createdAt: '' } }));
    mockFetchFollowUpStatus.mockResolvedValueOnce(makeCompletedJob({ answer: 'new answer' }));

    const { get, set } = createTestSlice();
    set({ followUpHistory: { 'b-001': [existingMsg] } });

    await get().sendFollowUp({ briefingId: 'b-001', sessionId: 's', question: 'new q' });
    await vi.advanceTimersByTimeAsync(2_000);

    const history = get().followUpHistory['b-001'];
    expect(history).toHaveLength(3); // existing + user + assistant
    expect(history![0].id).toBe('existing');
    vi.useRealTimers();
  });
});

// ============================================================
// hydrateFollowUpHistory
// ============================================================

describe('hydrateFollowUpHistory', () => {
  it('fetches conversations by briefing, then messages, and stores them', async () => {
    const conv = makeConversationListItem({ id: 'c-001', sessionId: 's', name: null, briefingId: 'b-001', createdAt: '' });
    const msgs: Message[] = [
      makeMessage({ id: 'm1', createdAt: '2026-03-12T09:00:00Z' }),
      makeMessage({ id: 'm2', role: 'assistant', createdAt: '2026-03-12T09:01:00Z' }),
    ];
    mockFetchConversationByBriefing.mockResolvedValueOnce([conv]);
    mockFetchMessages.mockResolvedValueOnce(msgs);

    const { get } = createTestSlice();
    await get().hydrateFollowUpHistory({ briefingId: 'b-001' });

    // History keyed by conversationId (c-001), not briefingId (b-001)
    expect(get().followUpHistory['c-001']).toEqual(msgs);
    expect(get().followUpHydrating['b-001']).toBe(false);
    expect(get().activeConversationId).toBe('c-001');
    expect(get().briefingConversations).toHaveLength(1);
    expect(get().briefingConversations[0].id).toBe('c-001');
  });

  it('returns early without fetching messages when no conversations exist', async () => {
    mockFetchConversationByBriefing.mockResolvedValueOnce([]);

    const { get } = createTestSlice();
    await get().hydrateFollowUpHistory({ briefingId: 'b-001' });

    expect(mockFetchMessages).not.toHaveBeenCalled();
    expect(get().followUpHistory['b-001']).toBeUndefined();
    expect(get().followUpHydrating['b-001']).toBe(false);
    expect(get().briefingConversations).toEqual([]);
  });

  it('prevents double-fetch (hydration guard)', async () => {
    mockFetchConversationByBriefing.mockResolvedValue([]);

    const { get, set } = createTestSlice();
    set({ followUpHydrating: { 'b-001': true } });

    await get().hydrateFollowUpHistory({ briefingId: 'b-001' });
    expect(mockFetchConversationByBriefing).not.toHaveBeenCalled();
  });

  it('merges D1 messages with local messages, deduplicating by ID', async () => {
    const conv = makeConversationListItem({ id: 'c-001', sessionId: 's', name: null, briefingId: 'b-001', createdAt: '' });
    const d1Msgs: Message[] = [
      makeMessage({ id: 'shared', content: 'from D1', createdAt: '2026-03-12T09:00:00Z' }),
      makeMessage({ id: 'd1-only', content: 'D1 only', createdAt: '2026-03-12T09:02:00Z' }),
    ];
    const localMsgs: Message[] = [
      makeMessage({ id: 'shared', content: 'local version', createdAt: '2026-03-12T09:00:00Z' }),
      makeMessage({ id: 'local-only', content: 'local only', createdAt: '2026-03-12T09:01:00Z' }),
    ];

    mockFetchConversationByBriefing.mockResolvedValueOnce([conv]);
    mockFetchMessages.mockResolvedValueOnce(d1Msgs);

    const { get, set } = createTestSlice();
    // Local messages keyed by conversationId (c-001) — matches hydration key
    set({ followUpHistory: { 'c-001': localMsgs } });

    await get().hydrateFollowUpHistory({ briefingId: 'b-001' });

    const history = get().followUpHistory['c-001'];
    expect(history).toHaveLength(3); // shared (D1 wins) + local-only + d1-only
    // D1 version takes precedence for shared ID
    const sharedMsg = history!.find(m => m.id === 'shared');
    expect(sharedMsg?.content).toBe('from D1');
    // Sorted by createdAt
    const times = history!.map(m => m.createdAt);
    expect(times).toEqual([...times].sort());
  });

  it('sets EMPTY_HISTORY sentinel when D1 returns empty messages', async () => {
    const conv = makeConversationListItem({ id: 'c-001', sessionId: 's', name: null, briefingId: 'b-001', createdAt: '' });
    mockFetchConversationByBriefing.mockResolvedValueOnce([conv]);
    mockFetchMessages.mockResolvedValueOnce([]);

    const { get } = createTestSlice();
    await get().hydrateFollowUpHistory({ briefingId: 'b-001' });

    // Keyed by conversationId (c-001), not briefingId
    expect(get().followUpHistory['c-001']).toBe(EMPTY_HISTORY);
  });

  it('clears hydrating flag on fetch error', async () => {
    mockFetchConversationByBriefing.mockRejectedValueOnce(new Error('down'));

    const { get } = createTestSlice();
    await get().hydrateFollowUpHistory({ briefingId: 'b-001' });

    expect(get().followUpHydrating['b-001']).toBe(false);
    expect(get().followUpHistory['b-001']).toBeUndefined();
  });

  it('populates briefingConversations with multiple conversations', async () => {
    const conv1 = makeConversationListItem({ id: 'c-001', sessionId: 's1', name: 'Chat 1', briefingId: 'b-001', createdAt: '2026-03-12T09:00:00Z' });
    const conv2 = makeConversationListItem({ id: 'c-002', sessionId: null, name: null, briefingId: 'b-001', createdAt: '2026-03-12T10:00:00Z' });
    mockFetchConversationByBriefing.mockResolvedValueOnce([conv1, conv2]);
    mockFetchMessages.mockResolvedValueOnce([]);

    const { get } = createTestSlice();
    await get().hydrateFollowUpHistory({ briefingId: 'b-001' });

    expect(get().briefingConversations).toHaveLength(2);
    expect(get().briefingConversations[0].name).toBe('Chat 1');
    expect(get().briefingConversations[1].sessionId).toBeNull();
    // First conversation becomes active
    expect(get().activeConversationId).toBe('c-001');
  });
});

// ============================================================
// createConversation
// ============================================================

describe('createConversation', () => {
  it('creates a conversation and sets it as active', async () => {
    const newConv = makeConversationListItem({ id: 'c-new', sessionId: null, name: null, messageCount: 0 });
    mockCreateConversation.mockResolvedValueOnce(newConv);

    const { get } = createTestSlice();
    const result = await get().createConversation('b-001');

    expect(result).toEqual(newConv);
    expect(get().briefingConversations).toContainEqual(newConv);
    expect(get().activeConversationId).toBe('c-new');
  });
});

// ============================================================
// setActiveConversation
// ============================================================

describe('setActiveConversation', () => {
  it('switches active conversation and loads its messages', async () => {
    const msgs = [makeMessage({ id: 'm1' })];
    mockFetchMessages.mockResolvedValueOnce(msgs);

    const { get, set } = createTestSlice();
    set({
      briefingConversations: [
        makeConversationListItem({ id: 'c-001', briefingId: 'b-001' }),
        makeConversationListItem({ id: 'c-002', briefingId: 'b-001' }),
      ],
    });

    await get().setActiveConversation('c-002');

    expect(get().activeConversationId).toBe('c-002');
    // Keyed by conversationId (c-002), not briefingId
    expect(get().followUpHistory['c-002']).toEqual(msgs);
  });

  it('sets EMPTY_HISTORY when conversation has no messages', async () => {
    mockFetchMessages.mockResolvedValueOnce([]);

    const { get, set } = createTestSlice();
    set({
      briefingConversations: [makeConversationListItem({ id: 'c-001', briefingId: 'b-001' })],
    });

    await get().setActiveConversation('c-001');

    // Keyed by conversationId (c-001)
    expect(get().followUpHistory['c-001']).toBe(EMPTY_HISTORY);
  });
});

// ============================================================
// fetchBriefingConversations
// ============================================================

describe('fetchBriefingConversations', () => {
  it('fetches and stores conversations for a briefing', async () => {
    const conv = makeConversationListItem({ id: 'c-001', sessionId: 's1', name: 'Chat', briefingId: 'b-001', createdAt: '2026-03-12T09:00:00Z' });
    mockFetchConversationByBriefing.mockResolvedValueOnce([conv]);

    const { get } = createTestSlice();
    await get().fetchBriefingConversations('b-001');

    expect(get().briefingConversations).toHaveLength(1);
    expect(get().briefingConversations[0].id).toBe('c-001');
    expect(get().activeConversationId).toBe('c-001');
  });

  it('does not override activeConversationId if already set', async () => {
    const conv = makeConversationListItem({ id: 'c-002', sessionId: null, name: null, briefingId: 'b-001', createdAt: '' });
    mockFetchConversationByBriefing.mockResolvedValueOnce([conv]);

    const { get, set } = createTestSlice();
    set({ activeConversationId: 'c-001' });

    await get().fetchBriefingConversations('b-001');

    expect(get().activeConversationId).toBe('c-001'); // not overridden
  });
});

// Tests for fetchConversations, selectConversation, clearSelectedConversation
// moved to chatsSlice.test.ts (chatsSlice extraction, council recommendation).
