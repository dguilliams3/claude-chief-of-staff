/**
 * Session CRUD routes — D1-backed endpoints for Claude session token metadata.
 *
 * Exposes session list, session detail, and usage update endpoints. Token metadata
 * (total_tokens, context_window, total_cost_usd, last_used_at) is written by the
 * local API after each CLI invocation via PATCH /sessions/:id/usage.
 *
 * Used by: `server/worker/src/index.ts` — mounted at `/sessions`
 * Used by: `server/worker/src/domain/session/index.ts` — barrel export
 * See also: `server/worker/src/db/schema.ts::sessions` — Drizzle schema for the `sessions` table
 * See also: `server/worker/src/domain/briefing/routes.ts` — parallel pattern (raw D1 queries)
 * Do NOT: Return raw D1 column names — always map to camelCase for the PWA contract
 * Do NOT: Use Drizzle query builder — use raw D1 `prepare().bind().all()` like existing routes
 */
import { Hono } from 'hono';
import type { Env } from '../../types';

const sessions = new Hono<{ Bindings: Env }>();

/**
 * Returns the 50 most recently used sessions with token metadata and briefing context.
 *
 * Joins sessions with briefings on `briefings.session_id = sessions.id` (LEFT JOIN)
 * to include briefing type and date for display context in the PWA. Sessions without
 * an associated briefing (e.g. standalone chats) are still returned.
 *
 * @returns Array of session summary objects, camelCase fields, ordered by last_used_at DESC
 *
 * Upstream: PWA session list view [PLANNED]
 * Downstream: D1 `sessions` + `briefings` tables — LEFT JOIN, ORDER BY last_used_at DESC LIMIT 50
 * Do NOT: Return sections/metadata from briefings — this is a summary endpoint
 */
sessions.get('/', async (c) => {
  // Subquery for latest briefing per session prevents duplicate rows
  // when a session is linked to multiple briefings
  const rows = await c.env.DB.prepare(`
    SELECT s.id, s.total_tokens, s.context_window, s.total_cost_usd, s.last_used_at, s.created_at,
           lb.type AS briefing_type, lb.generated_at AS briefing_generated_at
    FROM sessions s
    LEFT JOIN (
      SELECT session_id, type, generated_at,
             ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY generated_at DESC) AS rn
      FROM briefings
    ) lb ON lb.session_id = s.id AND lb.rn = 1
    ORDER BY s.last_used_at DESC NULLS LAST
    LIMIT 50
  `).all();

  const items = rows.results.map((row) => {
    const r = row as Record<string, string | number | null>;
    const totalTokens = r.total_tokens as number | null;
    const contextWindow = r.context_window as number | null;
    const hasTokenData = totalTokens != null || contextWindow != null;
    return {
      id: r.id,
      createdAt: r.created_at,
      briefingType: r.briefing_type,
      briefingGeneratedAt: r.briefing_generated_at,
      ...(hasTokenData && {
        tokenUsage: {
          totalTokens: totalTokens ?? 0,
          contextWindow: contextWindow ?? 0,
          totalCostUsd: (r.total_cost_usd as number) ?? 0,
          lastUsedAt: r.last_used_at as string | null,
        },
      }),
    };
  });

  return c.json(items);
});

/**
 * Returns a single session by ID with full token metadata.
 *
 * Includes associated briefing context if a briefing row links to this session.
 *
 * @param id - Route param: Claude session ID string
 * @returns Session object (camelCase fields) or 404 if not found
 *
 * Upstream: PWA session detail view [PLANNED]
 * Downstream: D1 `sessions` + `briefings` tables — LEFT JOIN WHERE s.id = ?
 */
sessions.get('/:id', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(`
    SELECT s.id, s.total_tokens, s.context_window, s.total_cost_usd, s.last_used_at, s.created_at,
           b.type AS briefing_type, b.generated_at AS briefing_generated_at
    FROM sessions s
    LEFT JOIN briefings b ON b.session_id = s.id AND b.generated_at = (
      SELECT MAX(b2.generated_at) FROM briefings b2 WHERE b2.session_id = s.id
    )
    WHERE s.id = ?
  `).bind(id).first();

  if (!row) return c.json({ error: 'Not found' }, 404);

  const r = row as Record<string, string | number | null>;
  const totalTokens = r.total_tokens as number | null;
  const contextWindow = r.context_window as number | null;
  const hasTokenData = totalTokens != null || contextWindow != null;
  return c.json({
    id: r.id,
    createdAt: r.created_at,
    briefingType: r.briefing_type,
    briefingGeneratedAt: r.briefing_generated_at,
    ...(hasTokenData && {
      tokenUsage: {
        totalTokens: totalTokens ?? 0,
        contextWindow: contextWindow ?? 0,
        totalCostUsd: (r.total_cost_usd as number) ?? 0,
        lastUsedAt: r.last_used_at as string | null,
      },
    }),
  });
});

/**
 * Updates token metadata on a session row after a CLI invocation.
 *
 * Sets total_tokens and context_window to the provided values (absolute, not additive).
 * Adds totalCostUsd to the running total. Sets last_used_at to now.
 *
 * Called by the local API (`server/local/server.ts`) after each successful `claude --print` invocation
 * via `parseCliUsage`. Returns 404 if the session does not exist.
 *
 * @param id - Route param: Claude session ID string
 * @body `{ totalTokens: number, contextWindow: number, totalCostUsd: number }`
 * @returns `{ status: 'ok' }` on success, 400 on missing fields, 404 if session not found
 *
 * Upstream: `server/local/server.ts` — called after CLI invocation completes [PLANNED]
 * Downstream: D1 `sessions` table — UPDATE WHERE id = ?
 * Coupling: `server/worker/src/db/schema.ts::sessions` — column names must match
 */
sessions.patch('/:id/usage', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ totalTokens?: number; contextWindow?: number; totalCostUsd?: number }>();

  const { totalTokens, contextWindow, totalCostUsd } = body;

  if (totalTokens == null || contextWindow == null || totalCostUsd == null) {
    return c.json({ error: 'Missing required fields: totalTokens, contextWindow, totalCostUsd' }, 400);
  }

  // Uses MAX for cost — same idempotent strategy as sync and push-complete paths.
  // Prevents double-counting if multiple code paths update the same session.
  const result = await c.env.DB.prepare(`
    UPDATE sessions
    SET total_tokens = ?, context_window = ?,
        total_cost_usd = MAX(total_cost_usd, ?),
        last_used_at = datetime('now')
    WHERE id = ?
  `).bind(totalTokens, contextWindow, totalCostUsd, id).run();

  if (result.meta.changes === 0) {
    return c.json({ error: 'Not found' }, 404);
  }

  return c.json({ status: 'ok' });
});

export { sessions };
