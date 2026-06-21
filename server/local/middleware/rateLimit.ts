/**
 * In-process rate limiter middleware for local API follow-up routes.
 *
 * Two independent tiers:
 * - **Per-session sliding window:** max 5 requests per 60 seconds per identifier
 *   (sessionId for resumes, conversationId for new sessions, fallback to 'unknown').
 * - **Global concurrent jobs:** max 10 concurrent follow-up jobs across all sessions.
 *   The caller passes a `getActiveJobCount` thunk to keep this module decoupled
 *   from followUpQueue internals.
 *
 * Returns 429 with `{ error, code: 'RATE_LIMITED', retryAfter }` and `Retry-After` header.
 * Logs a console.warn when any limit fires.
 *
 * Body-peek strategy: reads the raw body once, stashes the parsed object in `parsedBodies`
 * WeakMap keyed on the `Request` object so the downstream route handler retrieves it via
 * `getParsedBody(c.req.raw)` without re-parsing. WeakMap entries are GC'd when the
 * Request is garbage-collected — no manual cleanup needed.
 *
 * Used by: `server/local/domain/conversation/routes.ts` — POST /follow-up only
 * Downstream: `server/local/domain/conversation/routes.ts::POST /follow-up` — consumes `getParsedBody`
 * Coupling: `server/local/domain/conversation/followUpQueue.ts::getActiveFollowUpCount` — injected as thunk
 * Do NOT: Apply to GET endpoints — status polls are cheap reads.
 * Do NOT: Apply to briefing trigger — it is already rare and intentional.
 */
import type { Context, MiddlewareHandler, Next } from 'hono';

/**
 * Shape of the JSON body expected by the follow-up endpoint.
 * Defined here (rather than in routes.ts) because the rate-limit middleware
 * is the first consumer — it parses the body to extract the session identifier.
 *
 * Coupling: `server/local/domain/conversation/routes.ts::POST /follow-up` — must match
 * See also: `worker/src/domain/conversation/proxy.ts` — the upstream that assembles this body
 */
export interface FollowUpRequestBody {
  sessionId?: string;
  question: string;
  newSession?: boolean;
  conversationId?: string;
  briefingId?: string;
  isNewSession?: boolean;
}

/** Sliding-window bucket for one identifier. */
interface WindowBucket {
  timestamps: number[];
  expiryHandle: ReturnType<typeof setTimeout>;
}

const WINDOW_MS = 60_000; // 60-second window
const PER_SESSION_LIMIT = 5; // max requests per window per identifier
const GLOBAL_CONCURRENT_LIMIT = 10; // max active follow-up jobs system-wide

/** Per-session sliding window state — process-global, intentionally. */
const windows = new Map<string, WindowBucket>();

/**
 * Atomic reservation counter — prevents TOCTOU race on the global concurrent cap.
 * Incremented when a request passes the global check (before route handler runs),
 * decremented after route handler completes (in finally block). This ensures
 * concurrent requests that pass the check before any enqueue still respect the cap.
 */
let globalReservations = 0;

/**
 * WeakMap from Request → parsed JSON body, populated by the rate-limit middleware.
 * Route handlers call `getParsedBody(c.req.raw)` to avoid re-parsing.
 * GC'd automatically when the Request is collected.
 */
const parsedBodies = new WeakMap<Request, FollowUpRequestBody>();

/**
 * Retrieves the pre-parsed body stashed by `createFollowUpRateLimit`.
 * Returns undefined if called outside a rate-limited route (shouldn't happen in practice).
 *
 * @param req - The raw Request object from `c.req.raw`
 *
 * Upstream: `server/local/domain/conversation/routes.ts::POST /follow-up` handler
 */
export function getParsedBody(req: Request): FollowUpRequestBody | undefined {
  return parsedBodies.get(req);
}

/** Drops stale timestamps and removes empty buckets. Resets expiry timer. */
function pruneWindow(id: string): void {
  const bucket = windows.get(id);
  if (!bucket) return;
  const cutoff = Date.now() - WINDOW_MS;
  bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);
  clearTimeout(bucket.expiryHandle);
  if (bucket.timestamps.length === 0) {
    windows.delete(id);
  } else {
    bucket.expiryHandle = setTimeout(() => windows.delete(id), WINDOW_MS);
  }
}

/**
 * Returns a Hono middleware that enforces both rate-limit tiers on a route.
 *
 * @param getActiveJobCount - Thunk returning current number of running follow-up jobs.
 *   Injected by the caller to avoid circular imports with followUpQueue.
 * @returns Hono MiddlewareHandler
 *
 * Upstream: `server/local/domain/conversation/routes.ts::POST /follow-up`
 * Downstream: `server/local/domain/conversation/routes.ts::POST /follow-up` — rate-limited requests continue to route handler
 */
export function createFollowUpRateLimit(getActiveJobCount: () => number): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    // --- Global concurrent limit (atomic: count active jobs + in-flight reservations) ---
    if (getActiveJobCount() + globalReservations >= GLOBAL_CONCURRENT_LIMIT) {
      console.warn('Rate limited: global concurrent follow-up limit reached');
      c.header('Retry-After', '10');
      return c.json({ error: 'Rate limited', code: 'RATE_LIMITED', retryAfter: 10 }, 429);
    }

    // --- Parse body once; stash for downstream handler ---
    let body: FollowUpRequestBody = { question: '' };
    try {
      body = (await c.req.json()) as FollowUpRequestBody;
    } catch {
      // malformed JSON — route handler will produce its own 400
    }
    parsedBodies.set(c.req.raw, body);

    // --- Per-session sliding window ---
    const identifier: string = body.sessionId ?? body.conversationId ?? 'unknown';

    pruneWindow(identifier);
    const bucket = windows.get(identifier);
    const count = bucket?.timestamps.length ?? 0;

    if (count >= PER_SESSION_LIMIT) {
      const oldest = bucket!.timestamps[0]!;
      const retryAfter = Math.ceil((oldest + WINDOW_MS - Date.now()) / 1000);
      console.warn(`Rate limited: ${identifier}`);
      c.header('Retry-After', String(retryAfter));
      return c.json({ error: 'Rate limited', code: 'RATE_LIMITED', retryAfter }, 429);
    }

    // Record this request in the window
    const now = Date.now();
    if (bucket) {
      bucket.timestamps.push(now);
      clearTimeout(bucket.expiryHandle);
      bucket.expiryHandle = setTimeout(() => windows.delete(identifier), WINDOW_MS);
    } else {
      windows.set(identifier, {
        timestamps: [now],
        expiryHandle: setTimeout(() => windows.delete(identifier), WINDOW_MS),
      });
    }

    // Reserve a global slot before entering the route handler.
    // Released in finally to prevent leaks on errors or early returns.
    globalReservations++;
    try {
      await next();
    } finally {
      globalReservations--;
    }
  };
}
