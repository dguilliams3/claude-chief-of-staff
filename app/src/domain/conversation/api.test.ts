/**
 * Tests for the conversation domain API client functions.
 *
 * Tests: `app/src/domain/conversation/api.ts::sendFollowUp`
 * Tests: `app/src/domain/conversation/api.ts::fetchFollowUpStatus`
 * Tests: `app/src/domain/conversation/api.ts::fetchConversations`
 * Tests: `app/src/domain/conversation/api.ts::fetchConversationMessages`
 * Tests: `app/src/domain/conversation/api.ts::fetchConversationByBriefing`
 * Tests: `app/src/domain/conversation/api.ts::createConversation`
 * Tests: `app/src/domain/conversation/api.ts::updateConversationName`
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setAuthToken } from '@/lib/api';
import {
  sendFollowUp,
  fetchFollowUpStatus,
  fetchConversations,
  fetchConversationMessages,
  fetchConversationByBriefing,
  createConversation,
  updateConversationName,
} from '@/domain/conversation';
import { FollowUpError, ConversationError } from '@/domain/conversation/errors';
import type { Message, ConversationListItem, FollowUpResponse } from '@/domain/conversation';

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

const mockMessage: Message = {
  id: 'm-001',
  conversationId: 'c-001',
  role: 'user',
  content: 'What about the sprint?',
  createdAt: '2026-03-12T09:05:00Z',
};

const mockConversationListItem: ConversationListItem = {
  id: 'c-001',
  briefingId: 'b-001',
  sessionId: 'sess-001',
  name: null,
  createdAt: '2026-03-12T09:00:00Z',
  lastMessageAt: '2026-03-12T09:05:00Z',
  messageCount: 2,
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
// sendFollowUp
// ============================================================

describe('sendFollowUp', () => {
  const followUpResponse: FollowUpResponse = {
    jobId: 'job-001',
    persisted: true,
    userMessage: { id: 'um-1', conversationId: 'c-001', createdAt: '2026-03-12T09:05:00Z' },
    conversationId: 'c-001',
    isNewSession: false,
    briefingId: 'b-001',
  };

  it('returns FollowUpResponse on success', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(followUpResponse));

    const result = await sendFollowUp({
      sessionId: 'sess-001',
      question: 'What about the sprint?',
      briefingId: 'b-001',
    });

    expect(result).toEqual(followUpResponse);
  });

  it('sends correct method, URL, and body', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(followUpResponse));

    await sendFollowUp({ sessionId: 's1', question: 'q', briefingId: 'b1' });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${API_BASE}/briefings/follow-up`);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({
      sessionId: 's1',
      question: 'q',
      briefingId: 'b1',
    });
  });

  it('throws FollowUpError with persisted=false on 500 with error body', async () => {
    fetchSpy.mockResolvedValueOnce(
      errorResponse(500, { error: 'Tunnel down', persisted: false }),
    );

    try {
      await sendFollowUp({ sessionId: 's', question: 'q' });
      expect.unreachable('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(FollowUpError);
      const fErr = err as FollowUpError;
      expect(fErr.message).toBe('Tunnel down');
      expect(fErr.persisted).toBe(false);
      expect(fErr.sessionExpired).toBe(false);
      expect(fErr.sessionBusy).toBe(false);
    }
  });

  it('sets sessionExpired=true when code is SESSION_EXPIRED', async () => {
    fetchSpy.mockResolvedValueOnce(
      errorResponse(404, { error: 'Session not found', code: 'SESSION_EXPIRED' }),
    );

    try {
      await sendFollowUp({ sessionId: 's', question: 'q' });
      expect.unreachable('should throw');
    } catch (err) {
      const fErr = err as FollowUpError;
      expect(fErr.sessionExpired).toBe(true);
      expect(fErr.sessionBusy).toBe(false);
    }
  });

  it('sets sessionBusy=true when code is SESSION_BUSY', async () => {
    fetchSpy.mockResolvedValueOnce(
      errorResponse(409, { error: 'Session busy', code: 'SESSION_BUSY' }),
    );

    try {
      await sendFollowUp({ sessionId: 's', question: 'q' });
      expect.unreachable('should throw');
    } catch (err) {
      const fErr = err as FollowUpError;
      expect(fErr.sessionBusy).toBe(true);
      expect(fErr.sessionExpired).toBe(false);
    }
  });

  it('carries userMessage through on error when persisted', async () => {
    const um = { id: 'u1', conversationId: 'c1', createdAt: '2026-01-01T00:00:00Z' };
    fetchSpy.mockResolvedValueOnce(
      errorResponse(502, { error: 'Partial', persisted: true, userMessage: um }),
    );

    try {
      await sendFollowUp({ sessionId: 's', question: 'q' });
      expect.unreachable('should throw');
    } catch (err) {
      const fErr = err as FollowUpError;
      expect(fErr.persisted).toBe(true);
      expect(fErr.userMessage).toEqual(um);
    }
  });

  it('falls back gracefully when error body is not JSON', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('Gateway Timeout', { status: 504 }),
    );

    try {
      await sendFollowUp({ sessionId: 's', question: 'q' });
      expect.unreachable('should throw');
    } catch (err) {
      const fErr = err as FollowUpError;
      expect(fErr.message).toBe('API error: 504');
      expect(fErr.persisted).toBe(false);
    }
  });
});

// ============================================================
// fetchFollowUpStatus
// ============================================================

describe('fetchFollowUpStatus', () => {
  it('returns job status on success', async () => {
    const body = { jobId: 'job-1', status: 'completed', answer: 'The answer is 42.' };
    fetchSpy.mockResolvedValueOnce(jsonResponse(body));

    const result = await fetchFollowUpStatus({ jobId: 'job-1' });
    expect(result).toEqual(body);
  });

  it('sends GET to /briefings/follow-up/status/:jobId', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ jobId: 'job-1', status: 'running' }));
    await fetchFollowUpStatus({ jobId: 'job-1' });

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain(`${API_BASE}/briefings/follow-up/status/job-1`);
  });

  it('appends conversationId and briefingId as query params', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ jobId: 'j', status: 'running' }));
    await fetchFollowUpStatus({ jobId: 'j', conversationId: 'c-1', briefingId: 'b-1' });

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain('conversationId=c-1');
    expect(url).toContain('briefingId=b-1');
  });

  it('throws ConversationError on non-200', async () => {
    fetchSpy.mockResolvedValueOnce(errorResponse(404));
    await expect(fetchFollowUpStatus({ jobId: 'expired' })).rejects.toThrow(ConversationError);
  });
});

// ============================================================
// fetchConversations
// ============================================================

describe('fetchConversations', () => {
  it('returns array of ConversationListItem', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse([mockConversationListItem]));
    const result = await fetchConversations();
    expect(result).toEqual([mockConversationListItem]);
  });

  it('throws ConversationError on server error', async () => {
    fetchSpy.mockResolvedValueOnce(errorResponse(500));
    await expect(fetchConversations()).rejects.toThrow(ConversationError);
  });
});

// ============================================================
// fetchConversationMessages
// ============================================================

describe('fetchConversationMessages', () => {
  it('returns array of Message', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse([mockMessage]));
    const result = await fetchConversationMessages({ conversationId: 'c-001' });
    expect(result).toEqual([mockMessage]);
  });

  it('URL-encodes the conversation ID', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse([]));
    await fetchConversationMessages({ conversationId: 'id/special' });
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain(encodeURIComponent('id/special'));
  });

  it('throws ConversationError on 401', async () => {
    fetchSpy.mockResolvedValueOnce(errorResponse(401));
    await expect(fetchConversationMessages({ conversationId: 'c' })).rejects.toThrow(ConversationError);
  });
});

// ============================================================
// fetchConversationByBriefing
// ============================================================

describe('fetchConversationByBriefing', () => {
  it('returns array of ConversationListItem when found', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse([mockConversationListItem]));
    const result = await fetchConversationByBriefing({ briefingId: 'b-001' });
    expect(result).toEqual([mockConversationListItem]);
  });

  it('returns empty array when no conversation exists', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse([]));
    const result = await fetchConversationByBriefing({ briefingId: 'b-999' });
    expect(result).toEqual([]);
  });

  it('URL-encodes the briefing ID', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse([]));
    await fetchConversationByBriefing({ briefingId: 'b/special' });
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain(encodeURIComponent('b/special'));
  });

  it('throws ConversationError on server error', async () => {
    fetchSpy.mockResolvedValueOnce(errorResponse(503));
    await expect(fetchConversationByBriefing({ briefingId: 'b' })).rejects.toThrow(ConversationError);
  });
});

// ============================================================
// createConversation
// ============================================================

describe('createConversation', () => {
  it('returns newly created ConversationListItem', async () => {
    const newConversation: ConversationListItem = {
      id: 'c-new',
      briefingId: null,
      sessionId: null,
      name: null,
      createdAt: '2026-03-17T10:00:00Z',
      lastMessageAt: '',
      messageCount: 0,
    };
    fetchSpy.mockResolvedValueOnce(jsonResponse(newConversation));

    const result = await createConversation();
    expect(result).toEqual(newConversation);
  });

  it('sends POST to /conversations with optional briefingId', async () => {
    const newConversation: ConversationListItem = {
      id: 'c-new',
      briefingId: 'b-001',
      sessionId: null,
      name: null,
      createdAt: '2026-03-17T10:00:00Z',
      lastMessageAt: '',
      messageCount: 0,
    };
    fetchSpy.mockResolvedValueOnce(jsonResponse(newConversation));

    await createConversation({ briefingId: 'b-001' });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${API_BASE}/conversations`);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ briefingId: 'b-001' });
  });

  it('throws ConversationError on non-200', async () => {
    fetchSpy.mockResolvedValueOnce(errorResponse(500));
    await expect(createConversation()).rejects.toThrow(ConversationError);
  });
});

// ============================================================
// updateConversationName
// ============================================================

describe('updateConversationName', () => {
  it('returns updated id and name', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ id: 'c-001', name: 'My Chat' }));

    const result = await updateConversationName({ conversationId: 'c-001', name: 'My Chat' });
    expect(result).toEqual({ id: 'c-001', name: 'My Chat' });
  });

  it('sends PATCH to /conversations/:id with name in body', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ id: 'c-001', name: 'Updated' }));

    await updateConversationName({ conversationId: 'c-001', name: 'Updated' });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toContain(`${API_BASE}/conversations/c-001`);
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(init?.body as string)).toEqual({ name: 'Updated' });
  });

  it('URL-encodes the conversation ID', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ id: 'c/1', name: 'x' }));
    await updateConversationName({ conversationId: 'c/1', name: 'x' });
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain(encodeURIComponent('c/1'));
  });

  it('throws ConversationError on non-200', async () => {
    fetchSpy.mockResolvedValueOnce(errorResponse(404));
    await expect(updateConversationName({ conversationId: 'c', name: 'x' })).rejects.toThrow(ConversationError);
  });
});
