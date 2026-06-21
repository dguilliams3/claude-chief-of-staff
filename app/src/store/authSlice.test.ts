/**
 * Tests for auth slice — login, auto-login, logout race, stop* assertions.
 *
 * Tests: app/src/store/authSlice.ts::createAuthSlice
 * Tests: app/src/store/authSlice.ts::initAutoLogin
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAuthSlice, initAutoLogin } from '@/store/authSlice';
import type { AuthSlice } from '@/store/authSlice';

// ---------- mocks ----------

vi.mock('@/lib/api', () => ({
  setAuthToken: vi.fn(),
  validateAuthToken: vi.fn(),
}));

vi.mock('@/store/briefingSlice', () => ({
  stopBriefingPolling: vi.fn(),
  BRIEFING_INITIAL_STATE: {},
}));

vi.mock('@/store/conversationSlice', () => ({
  stopAllPolling: vi.fn(),
  CONVERSATION_INITIAL_STATE: {},
}));

vi.mock('@/store/chatsSlice', () => ({
  CHATS_INITIAL_STATE: {},
}));

import { setAuthToken, validateAuthToken } from '@/lib/api';
import { stopBriefingPolling } from '@/store/briefingSlice';
import { stopAllPolling as stopConversationPolling } from '@/store/conversationSlice';

const mockSetAuthToken = vi.mocked(setAuthToken);
const mockValidateAuthToken = vi.mocked(validateAuthToken);
const mockStopBriefingPolling = vi.mocked(stopBriefingPolling);
const mockStopConversationPolling = vi.mocked(stopConversationPolling);

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
});

// ---------- helper ----------

function createTestAuthSlice(storedToken: string | null = null) {
  let state: AuthSlice & Record<string, unknown>;
  const set = (partial: Partial<AuthSlice> & Record<string, unknown>) => {
    state = { ...state, ...partial };
  };
  const get = () => state;
  state = {
    ...createAuthSlice(set, get as () => AuthSlice, storedToken),
  };
  return { get: () => state, set };
}

// ============================================================
// initAutoLogin
// ============================================================

describe('initAutoLogin', () => {
  it('returns null when no stored token', () => {
    const set = vi.fn();
    const result = initAutoLogin(set);
    expect(result).toBeNull();
    expect(mockValidateAuthToken).not.toHaveBeenCalled();
  });

  it('returns stored token and fires validation', () => {
    storage.set('cos-token', 'tok-123');
    mockValidateAuthToken.mockResolvedValueOnce(true);
    const set = vi.fn();
    const result = initAutoLogin(set);
    expect(result).toBe('tok-123');
    expect(mockSetAuthToken).toHaveBeenCalledWith('tok-123');
  });

  it('sets authenticated=true on successful validation', async () => {
    storage.set('cos-token', 'tok-valid');
    mockValidateAuthToken.mockResolvedValueOnce(true);
    const set = vi.fn();
    initAutoLogin(set);

    // Wait for the async validation to resolve
    await vi.waitFor(() => {
      expect(set).toHaveBeenCalledWith(
        expect.objectContaining({ authenticated: true, loading: false }),
      );
    });
  });

  it('clears token on failed validation', async () => {
    storage.set('cos-token', 'tok-invalid');
    mockValidateAuthToken.mockResolvedValueOnce(false);
    const set = vi.fn();
    initAutoLogin(set);

    await vi.waitFor(() => {
      expect(set).toHaveBeenCalledWith(
        expect.objectContaining({ authenticated: false, loading: false }),
      );
    });
    expect(storage.has('cos-token')).toBe(false);
  });

  it('does NOT re-authenticate if user logged out during in-flight validation', async () => {
    storage.set('cos-token', 'tok-will-logout');
    // Validation takes time — simulate slow response
    mockValidateAuthToken.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(true), 50)),
    );
    const set = vi.fn();
    initAutoLogin(set);

    // Simulate logout: remove the token before validation resolves
    storage.delete('cos-token');

    // Give the .then() time to run after the 50ms delay
    await new Promise((r) => setTimeout(r, 150));

    // set should NOT have been called with authenticated: true
    const authTrueCalls = set.mock.calls.filter(
      (args) => (args[0] as Record<string, unknown>).authenticated === true,
    );
    expect(authTrueCalls).toHaveLength(0);
  });
});

// ============================================================
// login
// ============================================================

describe('login', () => {
  it('validates and sets authenticated on success', async () => {
    mockValidateAuthToken.mockResolvedValueOnce(true);
    const { get } = createTestAuthSlice();

    await get().login({ email: 'dan@test.com', token: 'tok-good' });

    expect(get().authenticated).toBe(true);
    expect(get().email).toBe('dan@test.com');
    expect(storage.get('cos-token')).toBe('tok-good');
  });

  it('sets authError on invalid credentials', async () => {
    mockValidateAuthToken.mockResolvedValueOnce(false);
    const { get } = createTestAuthSlice();

    await get().login({ email: 'dan@test.com', token: 'tok-bad' });

    expect(get().authenticated).toBe(false);
    expect(get().authError).toBe('Invalid credentials');
  });

  it('sets authError on network failure', async () => {
    mockValidateAuthToken.mockRejectedValueOnce(new Error('network'));
    const { get } = createTestAuthSlice();

    await get().login({ email: 'dan@test.com', token: 'tok-err' });

    expect(get().authenticated).toBe(false);
    expect(get().authError).toBe('Invalid credentials');
  });
});

// ============================================================
// logout
// ============================================================

describe('logout', () => {
  it('clears auth state, localStorage, and calls stop* functions', async () => {
    mockValidateAuthToken.mockResolvedValueOnce(true);
    const { get } = createTestAuthSlice();
    await get().login({ email: 'dan@test.com', token: 'tok-good' });

    get().logout();

    expect(get().authenticated).toBe(false);
    expect(get().email).toBe('');
    expect(storage.has('cos-token')).toBe(false);
    expect(storage.has('cos-email')).toBe(false);
    expect(mockStopBriefingPolling).toHaveBeenCalled();
    expect(mockStopConversationPolling).toHaveBeenCalled();
  });
});
