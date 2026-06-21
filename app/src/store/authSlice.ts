/**
 * Zustand auth slice -- authentication state and login/logout actions.
 *
 * Manages token persistence (localStorage), credential validation via
 * the lightweight /auth/validate endpoint, and coordinated teardown on
 * logout (stops all active polling before clearing state).
 *
 * Auto-login: When the store initializes, if a stored token exists, the
 * slice sets the auth header and fires a background validateAuthToken()
 * to check it. On failure the token is cleared and the user is logged out.
 *
 * Upstream: `app/src/store/index.ts` — merged into CosStore via spread; initAutoLogin called on store creation
 * Downstream: `app/src/lib/api/authToken.ts::setAuthToken`, `app/src/lib/api/validateAuth.ts::validateAuthToken`
 * Downstream: `app/src/store/briefingSlice.ts::stopBriefingPolling`, `app/src/store/conversationSlice.ts::stopAllPolling`
 * Do NOT: Import from domain modules — auth must not depend on briefing or conversation
 * Do NOT: Call fetch directly — use lib/api functions
 * Do NOT: Import React components -- store is framework-agnostic
 */
import { setAuthToken, validateAuthToken } from '@/lib/api';
import { stopBriefingPolling, BRIEFING_INITIAL_STATE } from './briefingSlice';
import { stopAllPolling as stopConversationPolling, CONVERSATION_INITIAL_STATE } from './conversationSlice';
import { CHATS_INITIAL_STATE } from './chatsSlice';

const TOKEN_KEY = 'cos-token';
const EMAIL_KEY = 'cos-email';

export interface AuthSlice {
  /** Whether the user is currently authenticated */
  authenticated: boolean;
  /** Stored email address for display */
  email: string;
  /** Error message from the most recent login attempt */
  authError: string;

  /**
   * Validate credentials and log in.
   *
   * Sets the auth token header, calls validateAuthToken() for validation,
   * and persists credentials to localStorage on success. After validation,
   * triggers a non-blocking briefing refresh via the store.
   *
   * @param options.email - User email for display/storage
   * @param options.token - Bearer token for API auth
   *
   * Upstream: `app/src/components/LoginView.tsx` — form submit handler
   * Downstream: `app/src/lib/api/authToken.ts::setAuthToken`, `app/src/lib/api/validateAuth.ts::validateAuthToken`
   * Do NOT: Call when already authenticated — no guard, will overwrite existing session
   */
  login: (options: { email: string; token: string }) => Promise<void>;

  /**
   * Log out and reset all state.
   *
   * Stops all active polling (briefing triggers and conversation follow-ups),
   * clears localStorage credentials, resets auth and data state.
   *
   * Upstream: `app/src/components/AppHeader.tsx` — logout button
   * Downstream: `app/src/store/briefingSlice.ts::stopBriefingPolling`, `app/src/store/conversationSlice.ts::stopAllPolling`
   * Downstream: `app/src/lib/api/authToken.ts::setAuthToken` (clears token)
   */
  logout: () => void;
}

/**
 * Auto-login initializer — runs once during store creation.
 *
 * Checks localStorage for a stored token. If found, sets the auth header
 * and fires a background validateAuthToken() to check it. On failure, clears
 * the invalid token and resets auth state. On success, triggers a non-blocking
 * briefing refresh via the set callback.
 *
 * @param set - Zustand set function (scoped to CosStore)
 * @returns The stored token string, or null if none found
 *
 * Upstream: `app/src/store/index.ts` — called once at store creation before createAuthSlice
 * Downstream: `app/src/lib/api/authToken.ts::setAuthToken`, `app/src/lib/api/validateAuth.ts::validateAuthToken`
 * Do NOT: Call after store creation — this is an init-time function only
 */
export function initAutoLogin(
  set: (partial: Partial<AuthSlice> & Record<string, unknown>) => void,
): string | null {
  const storedToken = localStorage.getItem(TOKEN_KEY);
  if (storedToken) {
    setAuthToken(storedToken);
    validateAuthToken()
      .then((valid) => {
        // Guard: if user logged out while validation was in-flight, the token
        // was removed from localStorage. Don't re-authenticate with a stale result.
        if (!localStorage.getItem(TOKEN_KEY)) return;

        if (valid) {
          // Token is good — mark as authenticated and let store trigger briefing refresh
          set({ authenticated: true, loading: false });
        } else {
          localStorage.removeItem(TOKEN_KEY);
          setAuthToken('');
          set({ authenticated: false, loading: false });
        }
      })
      .catch(() => {
        // Guard: if user logged out while validation was in-flight, skip cleanup
        if (!localStorage.getItem(TOKEN_KEY)) return;

        localStorage.removeItem(TOKEN_KEY);
        setAuthToken('');
        set({ authenticated: false, loading: false });
      });
  }
  return storedToken;
}

/**
 * Factory function for the auth slice.
 *
 * Returns the auth state fields and action implementations. Merged into
 * the main CosStore via object spread in store/index.ts.
 *
 * @param set - Zustand set function (scoped to CosStore)
 * @param get - Zustand get function (scoped to CosStore)
 * @param storedToken - Result of initAutoLogin(), used to set initial authenticated state
 *
 * Upstream: `app/src/store/index.ts` — called during Zustand store creation
 * Downstream: `app/src/lib/api/authToken.ts::setAuthToken`, `app/src/lib/api/validateAuth.ts::validateAuthToken`
 * Downstream: `app/src/store/briefingSlice.ts::stopBriefingPolling`, `app/src/store/conversationSlice.ts::stopAllPolling`
 * Pattern: STORE-FIRST — slice factory pattern, actions write to store, components read via selectors
 */
export function createAuthSlice(
  set: (partial: Partial<AuthSlice> & Record<string, unknown>) => void,
  _get: () => AuthSlice,
  storedToken: string | null,
): AuthSlice {
  return {
    authenticated: !!storedToken,
    email: localStorage.getItem(EMAIL_KEY) ?? '',
    authError: '',

    async login({ email: inputEmail, token }: { email: string; token: string }) {
      set({ authError: '' });
      setAuthToken(token);
      try {
        const valid = await validateAuthToken();
        if (!valid) {
          setAuthToken('');
          set({ authError: 'Invalid credentials', authenticated: false });
          return;
        }
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(EMAIL_KEY, inputEmail);
        set({
          authenticated: true,
          email: inputEmail,
          loading: false, // Cross-slice: BriefingSlice.loading — set via Record<string, unknown> escape hatch
        });
      } catch {
        setAuthToken('');
        set({ authError: 'Invalid credentials', authenticated: false });
      }
    },

    logout() {
      stopBriefingPolling();
      stopConversationPolling();
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(EMAIL_KEY);
      setAuthToken('');
      set({
        authenticated: false,
        email: '',
        authError: '',
        ...BRIEFING_INITIAL_STATE,
        ...CONVERSATION_INITIAL_STATE,
        ...CHATS_INITIAL_STATE,
      });
    },
  };
}
