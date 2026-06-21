/**
 * Authentication form -- email and token login screen for the Chief of Staff PWA.
 *
 * PRESENTATIONAL with local form state. Renders when the user is not authenticated.
 * Delegates actual auth to the store's `login` action, which validates the token
 * against the Worker API by attempting a briefing fetch.
 *
 * Used by: `app/src/App.tsx::App` -- rendered when `authenticated` is false
 * See also: `app/src/store/index.ts::login` -- auth action that validates credentials
 * Do NOT: Store the token in component state long-term -- store manages localStorage persistence
 */
import { useState } from 'react';
import { useStore } from '@/store';

declare const __APP_NAME__: string;

/**
 * Full-screen login form with email and token inputs. Displays auth errors
 * from the store and shows a loading state during authentication attempts.
 * The "Token" field accepts the bearer token used for Worker API auth.
 *
 * Upstream: `app/src/App.tsx::App` -- rendered when `authenticated` is false
 * Downstream: `app/src/store/index.ts::login`
 * Do NOT: Add "remember me" logic here -- token persistence is handled by the store
 */
export function LoginScreen() {
  const login = useStore((s) => s.login);
  const authError = useStore((s) => s.authError);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    try {
      await login({ email, token: password });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        {/* Masthead */}
        <div className="text-center mb-10">
          <h1
            className="font-display text-3xl text-primary tracking-tight italic"
          >
            {__APP_NAME__}
          </h1>
          <p
            className="font-mono text-muted mt-2 text-xs tracking-[0.2em] uppercase"
          >
            Operational Intelligence
          </p>
        </div>

        {/* Login card */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              aria-label="Email address"
              autoComplete="email"
              className="w-full px-4 py-3 rounded-[var(--radius-input)] bg-surface border border-border text-primary placeholder:text-muted/50 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors font-body"
            />
          </div>
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Token"
              aria-label="Authentication token"
              autoComplete="current-password"
              className="w-full px-4 py-3 rounded-[var(--radius-input)] bg-surface border border-border text-primary placeholder:text-muted/50 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors font-body"
            />
          </div>

          {authError && (
            <p role="alert" className="font-mono text-severity-flag text-xs text-center">
              {authError}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full py-3 rounded-[var(--radius-input)] bg-accent text-white text-sm font-medium tracking-wide transition-all hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed font-body"
          >
            {loading ? 'Authenticating...' : 'Enter'}
          </button>
        </form>
      </div>
    </div>
  );
}
