/**
 * Integration test for the composed Zustand store — subscribe hydration.
 *
 * Tests: app/src/store/index.ts — useStore.subscribe hydrates briefings on auth transition
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------- mocks (must be before store import) ----------

vi.mock('@/lib/api', () => ({
  setAuthToken: vi.fn(),
  getAuthToken: vi.fn(() => ''),
  validateAuthToken: vi.fn(),
  headers: vi.fn(() => ({ 'Content-Type': 'application/json' })),
  API_BASE: 'http://localhost:3141',
}));

vi.mock('@/domain/briefing', () => ({
  fetchBriefings: vi.fn(),
  triggerBriefing: vi.fn(),
  fetchTriggerStatus: vi.fn(),
  fetchBriefingList: vi.fn(),
  fetchBriefingById: vi.fn(),
}));

vi.mock('@/domain/conversation', () => ({
  sendFollowUp: vi.fn(),
  fetchFollowUpStatus: vi.fn(),
  fetchConversations: vi.fn(),
  fetchConversationMessages: vi.fn(),
  fetchConversationByBriefing: vi.fn(),
  createConversation: vi.fn(),
  updateConversationName: vi.fn(),
  FollowUpError: class extends Error {},
  EMPTY_HISTORY: [],
  mergeMessages: vi.fn((...args: unknown[]) => args[0]),
  isAwaitingResponse: vi.fn(),
  awaitingSince: vi.fn(),
  assignConversationName: vi.fn(),
}));

vi.mock('@/domain/conversation/errors', () => ({
  FollowUpError: class extends Error {},
}));

vi.mock('@/domain/conversation/conversation-name', () => ({
  assignConversationName: vi.fn(),
}));

vi.mock('@/lib/polling', () => ({
  pollForResult: vi.fn(),
  stopPolling: vi.fn(),
  stopAllPolling: vi.fn(),
}));

import { validateAuthToken } from '@/lib/api';
import { fetchBriefings } from '@/domain/briefing';

const mockValidateAuthToken = vi.mocked(validateAuthToken);
const mockFetchBriefings = vi.mocked(fetchBriefings);

// ---------- localStorage stub ----------

const storage = new Map<string, string>();

beforeEach(() => {
  vi.clearAllMocks();
  storage.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, val: string) => storage.set(key, val),
    removeItem: (key: string) => storage.delete(key),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

// ============================================================
// Subscribe hydration
// ============================================================

describe('subscribe hydration', () => {
  it('calls silentRefresh (fetchBriefings) when authenticated transitions false→true via login', async () => {
    // Import the real store — this triggers module-level subscribe()
    const { useStore } = await import('@/store/index');

    // fetchBriefings is called by silentRefresh (via fetchAndSet)
    mockFetchBriefings.mockResolvedValue({});
    mockValidateAuthToken.mockResolvedValueOnce(true);

    // Login triggers authenticated false→true
    await useStore.getState().login({ email: 'dan@test.com', token: 'tok-test' });

    // The subscribe callback should have called silentRefresh → fetchBriefings
    expect(mockFetchBriefings).toHaveBeenCalled();
  });
});
