/**
 * Briefing CRUD routes — D1-backed read and write endpoints for briefing data.
 *
 * STABLE CONTRACT consumed by the PWA and by `run-briefing.sh --sync`.
 *
 * Used by: `app/src/domain/briefing/api.ts::fetchBriefings` (GET /latest), `run-briefing.sh` (POST /sync)
 * Used by: `server/worker/src/domain/briefing/index.ts` — barrel export
 * See also: `server/worker/src/db/schema.ts::briefings` — Drizzle schema for the `briefings` table
 * See also: `server/worker/src/domain/conversation/proxy.ts` — tunnel proxy routes mounted on the same prefix
 * Do NOT: Return raw D1 column names — always map to camelCase for the PWA contract
 */
import { Hono } from 'hono';
import type { Env } from '../../types';
import { ensureConversation } from '../conversation/persistence';
import { sendPushToAll, computeSeveritySummary } from '../push';
import briefingTypesMeta from '../../../../../shared/briefing-types.json';

const briefings = new Hono<{ Bindings: Env }>();

/** Safe JSON.parse — returns fallback on malformed data instead of crashing the endpoint. */
function safeJsonParse(json: string, fallback: unknown = null): unknown {
  try { return JSON.parse(json); }
  catch { console.error('Malformed JSON in D1 row:', json.slice(0, 100)); return fallback; }
}

/**
 * Returns the latest briefing per type from D1, with session token metadata.
 *
 * Queries `briefings` table grouped by `type`, selecting the row with the most
 * recent `generated_at` per type. LEFT JOINs `sessions` to include token usage
 * metadata for the AppHeader token indicator (`29K/1M`).
 *
 * @returns `Record<string, Briefing>` — one briefing per type, camelCase fields,
 *   with optional `tokenUsage` field when session token data is available
 *
 * Upstream: `app/src/domain/briefing/api.ts::fetchBriefings`
 * Downstream: D1 `briefings` + `sessions` tables — `SELECT ... GROUP BY type` with LEFT JOIN
 * Do NOT: Add pagination — this always returns at most one row per type
 */
briefings.get('/latest', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT b.*, s.total_tokens, s.context_window, s.total_cost_usd, s.last_used_at
    FROM briefings b
    INNER JOIN (
      SELECT type, MAX(generated_at) as max_gen
      FROM briefings GROUP BY type
    ) latest ON b.type = latest.type AND b.generated_at = latest.max_gen
    LEFT JOIN sessions s ON b.session_id = s.id
  `).all();

  const result: Record<string, unknown> = {};
  for (const row of rows.results) {
    const r = row as Record<string, string | number | null>;
    const totalTokens = r.total_tokens as number | null;
    const contextWindow = r.context_window as number | null;
    const totalCostUsd = r.total_cost_usd as number | null;
    const lastUsedAt = r.last_used_at as string | null;

    const tokenUsage = (totalTokens != null || contextWindow != null)
      ? {
          totalTokens: totalTokens ?? 0,
          contextWindow: contextWindow ?? 0,
          totalCostUsd: totalCostUsd ?? 0,
          lastUsedAt: lastUsedAt ?? null,
        }
      : undefined;

    result[r.type as string] = {
      id: r.id,
      type: r.type,
      generatedAt: r.generated_at,
      sessionId: r.session_id,
      sections: safeJsonParse(r.sections_json as string, []),
      metadata: safeJsonParse(r.metadata_json as string, {}),
      ...(tokenUsage !== undefined && { tokenUsage }),
    };
  }

  return c.json(result);
});

/**
 * Returns a summary list of the most recent 50 briefings for the History view.
 *
 * Each item includes id, type, generatedAt, sectionCount, maxSeverity, and
 * briefingNumber. Sections are parsed to compute aggregate severity.
 *
 * @returns Array of briefing summary objects, camelCase fields
 *
 * Upstream: `app/src/domain/briefing/api.ts` — History tab list view [PLANNED — not yet wired]
 * Downstream: D1 `briefings` table — `SELECT ... ORDER BY generated_at DESC LIMIT 50`
 * Do NOT: Return full sections/metadata here — use GET /:id for that
 */
briefings.get('/', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT id, type, generated_at, sections_json, metadata_json
    FROM briefings ORDER BY generated_at DESC LIMIT 50
  `).all();

  const items = rows.results.map((row) => {
    const r = row as Record<string, string>;
    const sections = safeJsonParse(r.sections_json, []) as { severity?: string }[];
    const meta = safeJsonParse(r.metadata_json, {}) as { briefingNumber?: number | null };
    const severities = sections.map(s => s.severity ?? 'info');
    const maxSeverity = severities.includes('flag') ? 'flag' : severities.includes('warn') ? 'warn' : 'info';
    return {
      id: r.id,
      type: r.type,
      generatedAt: r.generated_at,
      sectionCount: sections.length,
      maxSeverity,
      briefingNumber: meta.briefingNumber ?? null,
    };
  });

  return c.json(items);
});

// NOTE: /trend, /standing-issues, /backfill-sections MUST be defined before /:id
// because Hono matches routes in order and /:id would catch "trend" as an ID param.

/**
 * GET /trend — returns cross-briefing trend data for a section key over time.
 *
 * Queries `briefing_sections` for all rows matching a given section key within
 * the specified time window. Optionally filtered by severity.
 *
 * @query section - Required. Section key to query (e.g. `"jira-summary"`)
 * @query days - Optional. Lookback window in days (default: 30, max: 90)
 * @query severity - Optional. Filter by severity (`"flag"`, `"warn"`, `"info"`)
 * @returns Array of section snapshot objects, newest first, max 100 rows
 *
 * Upstream: [PLANNED] PWA trend view — not yet wired
 * Downstream: D1 `briefing_sections` table — JOIN with `briefings` on briefing_id
 * Do NOT: Return full Markdown content for large windows — this is an analysis endpoint
 */
briefings.get('/trend', async (c) => {
  const sectionKey = c.req.query('section');
  if (!sectionKey) {
    return c.json({ error: 'section query parameter required' }, 400);
  }

  const days = Math.min(parseInt(c.req.query('days') ?? '30', 10) || 30, 90);
  const severity = c.req.query('severity');
  const validSeverities = ['flag', 'warn', 'info'];
  if (severity && !validSeverities.includes(severity)) {
    return c.json({ error: `Invalid severity. Must be one of: ${validSeverities.join(', ')}` }, 400);
  }

  let sql = `
    SELECT bs.section_key, bs.label, bs.severity, bs.content, bs.briefing_id, bs.created_at,
           b.type as briefing_type
    FROM briefing_sections bs
    JOIN briefings b ON b.id = bs.briefing_id
    WHERE bs.section_key = ?
    AND bs.created_at >= datetime('now', ?)
  `;
  const binds: (string | number)[] = [sectionKey, `-${days} days`];

  if (severity) {
    sql += ' AND bs.severity = ?';
    binds.push(severity);
  }

  sql += ' ORDER BY bs.created_at DESC LIMIT 100';

  const rows2 = await c.env.DB.prepare(sql).bind(...binds).all();

  return c.json(rows2.results.map((row) => {
    const r = row as Record<string, string>;
    return {
      sectionKey: r.section_key,
      label: r.label,
      severity: r.severity,
      content: r.content,
      briefingId: r.briefing_id,
      briefingType: r.briefing_type,
      createdAt: r.created_at,
    };
  }));
});

/**
 * GET /standing-issues — returns section keys with elevated severity recurring across multiple briefings.
 *
 * Groups `briefing_sections` by section_key where severity is `warn` or `flag`,
 * then filters to those appearing at least `min` times within the lookback window.
 * Useful for identifying persistent problems that survive day-to-day briefing cycles.
 *
 * @query days - Optional. Lookback window in days (default: 30, max: 90)
 * @query min - Optional. Minimum occurrence count to qualify as a standing issue (default: 3)
 * @returns Array of standing issue objects ordered by occurrence count DESC
 *
 * Upstream: [PLANNED] PWA standing issues view — not yet wired
 * Downstream: D1 `briefing_sections` table — GROUP BY section_key HAVING COUNT >= min
 */
briefings.get('/standing-issues', async (c) => {
  const days = Math.min(parseInt(c.req.query('days') ?? '30', 10) || 30, 90);
  const minOccurrences = parseInt(c.req.query('min') ?? '3', 10) || 3;

  const rows2 = await c.env.DB.prepare(`
    SELECT bs.section_key, bs.label, COUNT(*) as occurrences,
           CASE MAX(CASE bs.severity WHEN 'flag' THEN 3 WHEN 'warn' THEN 2 ELSE 1 END)
             WHEN 3 THEN 'flag' WHEN 2 THEN 'warn' ELSE 'info' END as latest_severity,
           (SELECT content FROM briefing_sections
            WHERE section_key = bs.section_key
            ORDER BY created_at DESC LIMIT 1) as latest_content
    FROM briefing_sections bs
    WHERE bs.severity IN ('warn', 'flag')
    AND bs.created_at >= datetime('now', ?)
    GROUP BY bs.section_key
    HAVING occurrences >= ?
    ORDER BY occurrences DESC
  `).bind(`-${days} days`, minOccurrences).all();

  return c.json(rows2.results.map((row) => {
    const r = row as Record<string, string | number>;
    return {
      sectionKey: r.section_key,
      label: r.label,
      occurrences: r.occurrences,
      latestSeverity: r.latest_severity,
      latestContent: r.latest_content,
    };
  }));
});

/** GET /types — serves briefing type metadata from shared JSON (no tunnel needed). */
briefings.get('/types', (c) => {
  return c.json({ types: briefingTypesMeta });
});

/**
 * Returns a single briefing by ID with full sections and metadata.
 * NOTE: /:id MUST be the LAST GET route — it matches any path segment.
 *
 * @param id - Route param: briefing UUID
 * @returns Full Briefing object (camelCase fields) or 404 if not found
 *
 * Upstream: `app/src/domain/briefing/api.ts` — History detail view [PLANNED — not yet wired]
 * Downstream: D1 `briefings` table — `SELECT * WHERE id = ?`
 */
briefings.get('/:id', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(
    'SELECT * FROM briefings WHERE id = ?'
  ).bind(id).first();

  if (!row) return c.json({ error: 'Not found' }, 404);

  const r = row as Record<string, string>;
  return c.json({
    id: r.id,
    type: r.type,
    generatedAt: r.generated_at,
    sessionId: r.session_id,
    sections: safeJsonParse(r.sections_json as string, []),
    metadata: safeJsonParse(r.metadata_json as string, {}),
  });
});

/**
 * Stores or replaces a briefing in D1 via `INSERT OR REPLACE`.
 *
 * Called by `run-briefing.sh --sync` after local briefing generation completes.
 * Expects a full briefing JSON body with `id`, `type`, `generatedAt`, `sessionId`,
 * `sections` (array), and `metadata` (object). Sections and metadata are stringified
 * for storage as TEXT columns in D1.
 *
 * After persisting the briefing, ensures a session + conversation row exists for this
 * briefing's sessionId (non-fatal on failure — lazy creation handles it at follow-up time).
 *
 * @returns `{ status: 'ok', id: string }`
 *
 * Upstream: `scripts/run-briefing.sh` via Node fetch (not curl — UTF-8 safety)
 * Downstream: D1 `briefings` table — `INSERT OR REPLACE`
 * Downstream: D1 `sessions` + `conversations` tables via `ensureConversation()` (non-fatal)
 * Coupling: `server/worker/src/db/schema.ts::briefings` — column names must match bind order
 * Coupling: `server/worker/src/domain/conversation/persistence.ts::ensureConversation` — lazy session/conversation creation
 * Do NOT: Use curl to call this endpoint — MINGW mangles UTF-8 multi-byte characters
 */
briefings.post('/sync', async (c) => {
  const briefing = await c.req.json();

  // Validate required fields before attempting INSERT
  const required = ['id', 'type', 'generatedAt', 'sessionId', 'sections', 'metadata'] as const;
  const missing = required.filter((k) => briefing[k] == null);
  if (missing.length > 0) {
    return c.json({ error: `Missing required fields: ${missing.join(', ')}` }, 400);
  }

  await c.env.DB.prepare(`
    INSERT OR REPLACE INTO briefings (id, type, generated_at, session_id, sections_json, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    briefing.id,
    briefing.type,
    briefing.generatedAt,
    briefing.sessionId,
    JSON.stringify(briefing.sections),
    JSON.stringify(briefing.metadata),
  ).run();

  // Unflatten sections into briefing_sections table for cross-briefing queries (non-fatal)
  try {
    const sections = briefing.sections as { key: string; label: string; severity?: string; content: string }[];
    if (sections.length > 0) {
      const stmts = sections.map((s) =>
        c.env.DB.prepare(`
          INSERT OR IGNORE INTO briefing_sections (id, briefing_id, section_key, label, severity, content, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
          `${briefing.id}-${s.key}`,
          briefing.id,
          s.key,
          s.label,
          s.severity ?? 'info',
          s.content,
          briefing.generatedAt,
        )
      );
      await c.env.DB.batch(stmts);
    }
  } catch (err) {
    console.error('Failed to write briefing_sections:', err);
  }

  // Ensure session + conversation exist for this briefing (non-fatal)
  try {
    await ensureConversation(c.env.DB, briefing.sessionId, briefing.id);
  } catch (err) {
    console.error('Failed to ensure conversation during sync:', err);
    // Non-fatal: sync succeeds even if conversation creation fails.
    // Lazy creation in persistUserMessage handles this at follow-up time.
  }

  // Update session token metadata if usage data is present (non-fatal).
  // Uses MAX for cost to avoid double-counting if called multiple times.
  if (briefing.usage && briefing.sessionId) {
    try {
      await c.env.DB.prepare(`
        UPDATE sessions
        SET total_tokens = ?, context_window = ?,
            total_cost_usd = MAX(total_cost_usd, ?),
            last_used_at = datetime('now')
        WHERE id = ?
      `).bind(
        briefing.usage.totalTokens ?? 0,
        briefing.usage.contextWindow ?? 0,
        briefing.usage.costUsd ?? 0,
        briefing.sessionId,
      ).run();
    } catch (err) {
      console.error('Failed to update session token metadata:', err);
    }
  }

  // Send push notification with severity summary (non-fatal, via waitUntil if available)
  const sections = briefing.sections as { severity?: string }[];
  const typeLabel = briefing.type === 'work' ? 'Work' : briefing.type === 'news' ? 'News' : briefing.type;
  const summary = computeSeveritySummary(sections);
  const pushBody = `${typeLabel} briefing ready — ${summary}`;

  if (c.env.VAPID_PUBLIC_KEY && c.env.VAPID_PRIVATE_KEY && c.env.VAPID_SUBJECT) {
    // Fire-and-forget push — don't block the sync response
    const pushPromise = sendPushToAll(c.env.DB, {
      title: typeLabel + ' Briefing',
      body: pushBody,
      url: '/',
      icon: '/icon-192.png',
    }, {
      publicKey: c.env.VAPID_PUBLIC_KEY,
      privateKey: c.env.VAPID_PRIVATE_KEY,
      subject: c.env.VAPID_SUBJECT,
    }).catch(err => console.error('Push notification failed:', err));

    // Use waitUntil if available (Cloudflare Workers context)
    if (c.executionCtx?.waitUntil) {
      c.executionCtx.waitUntil(pushPromise);
    }
  }

  return c.json({ status: 'ok', id: briefing.id });
});

/**
 * POST /backfill-sections — one-time backfill of the `briefing_sections` table.
 *
 * Reads all existing briefings, parses their `sections_json`, and writes each
 * section into the `briefing_sections` table. Uses INSERT OR IGNORE so it is
 * safe to run multiple times (idempotent). Errors per briefing are logged but
 * do not abort the entire operation.
 *
 * @returns `{ status: 'ok', briefings: number, sections: number }`
 *
 * Upstream: One-time admin call via curl or Node fetch — run once after migration
 * Downstream: D1 `briefing_sections` table — batch INSERT OR IGNORE
 * Do NOT: Run in response to user actions — this is a maintenance/migration endpoint only
 */
briefings.post('/backfill-sections', async (c) => {
  // Incremental: only process briefings that don't have sections yet
  const rows = await c.env.DB.prepare(`
    SELECT b.id, b.sections_json, b.generated_at FROM briefings b
    WHERE NOT EXISTS (SELECT 1 FROM briefing_sections bs WHERE bs.briefing_id = b.id)
  `).all();

  let totalSections = 0;
  for (const row of rows.results) {
    const r = row as Record<string, string>;
    try {
      const sections = JSON.parse(r.sections_json) as { key: string; label: string; severity?: string; content: string }[];
      if (sections.length > 0) {
        const stmts = sections.map((s) =>
          c.env.DB.prepare(`
            INSERT OR IGNORE INTO briefing_sections (id, briefing_id, section_key, label, severity, content, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).bind(
            `${r.id}-${s.key}`,
            r.id,
            s.key,
            s.label,
            s.severity ?? 'info',
            s.content,
            r.generated_at,
          )
        );
        await c.env.DB.batch(stmts);
        totalSections += sections.length;
      }
    } catch (err) {
      console.error(`Backfill failed for briefing ${r.id}:`, err);
    }
  }

  return c.json({ status: 'ok', briefings: rows.results.length, sections: totalSections });
});

export { briefings };
