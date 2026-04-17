/**
 * Tests for the Zustand chats slice — Chats tab list/detail navigation.
 *
 * Tests: `app/src/store/chatsSlice.ts::createChatsSlice`
 * Tests: `app/src/store/chatsSlice.ts::ChatsSlice` (interface exercised through actions)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createChatsSlice } from '@/store/chatsSlice';
import type { ChatsSlice } from '@/store/chatsSlice';
import type { Message, ConversationListItem } from '@/domain/conversation';

// ---------- mocks ----------

vi.mock('@/domain/conversation', () => ({
  fetchConversations: vi.fn(),
  fetchConversationMessages: vi.fn(),
}));

import {
  fetchConversations as apiFetchConversations,
  fetchConversationMessages as apiFetchMessages,
} from '@/domain/conversation';

const mockFetchConversations = vi.mocked(apiFetchConversations);
const mockFetchMessages = vi.mocked(apiFetchMessages);

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

// ---------- helper ----------

function createTestSlice() {
  let state: ChatsSlice;
  const set = (partial: Partial<ChatsSlice>) => {
    state = { ...state, ...partial };
  };
  const get = () => state;
  state = createChatsSlice(set, get);
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
  it('starts with empty chats state', () => {
    const { get } = createTestSlice();
    expect(get().conversations).toEqual([]);
    expect(get().conversationsLoading).toBe(false);
    expect(get().selectedConversation).toBeNull();
    expect(get().selectedConversationMessages).toEqual([]);
    expect(get().selectedConversationLoading).toBe(false);
    expect(get().conversationErrors).toEqual({});
  });
});

// ============================================================
// fetchConversations
// ============================================================

describe('fetchConversations', () => {
  it('sets conversations on success', async () => {
    const items = [makeConversationListItem()];
    mockFetchConversations.mockResolvedValueOnce(items);

    const { get } = createTestSlice();
    await get().fetchConversations();

    expect(get().conversations).toEqual(items);
    expect(get().conversationsLoading).toBe(false);
  });

  it('clears loading flag on failure', async () => {
    mockFetchConversations.mockRejectedValueOnce(new Error('down'));

    const { get } = createTestSlice();
    await get().fetchConversations();

    expect(get().conversationsLoading).toBe(false);
  });
});

// ============================================================
// selectConversation
// ============================================================

describe('selectConversation', () => {
  it('fetches messages and sets selectedConversation', async () => {
    const conversation = makeConversationListItem();
    const messages = [makeMessage()];
    mockFetchMessages.mockResolvedValueOnce(messages);

    const { get } = createTestSlice();
    await get().selectConversation({ conversation });

    expect(get().selectedConversation).toEqual(conversation);
    expect(get().selectedConversationMessages).toEqual(messages);
    expect(get().selectedConversationLoading).toBe(false);
  });

  it('clears selection when null', async () => {
    const { get, set } = createTestSlice();
    set({
      selectedConversation: makeConversationListItem(),
      selectedConversationMessages: [makeMessage()],
    });

    await get().selectConversation({ conversation: null });

    expect(get().selectedConversation).toBeNull();
    expect(get().selectedConversationMessages).toEqual([]);
  });

  it('clears selection on fetch failure', async () => {
    mockFetchMessages.mockRejectedValueOnce(new Error('down'));

    const { get } = createTestSlice();
    await get().selectConversation({ conversation: makeConversationListItem() });

    expect(get().selectedConversation).toBeNull();
    expect(get().selectedConversationLoading).toBe(false);
  });
});

// ============================================================
// clearSelectedConversation
// ============================================================

describe('clearSelectedConversation', () => {
  it('resets selection state', () => {
    const { get, set } = createTestSlice();
    set({
      selectedConversation: makeConversationListItem(),
      selectedConversationMessages: [makeMessage()],
    });

    get().clearSelectedConversation();

    expect(get().selectedConversation).toBeNull();
    expect(get().selectedConversationMessages).toEqual([]);
  });
});
