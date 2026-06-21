/**
 * Export routes — records export events and stores artifacts in R2.
 *
 * Tracks every briefing export (PDF, markdown, etc.) in D1 and stores
 * the generated artifact in the EXPORTS_BUCKET R2 binding.
 *
 * Used by: `server/worker/src/index.ts` — mounted at `/exports`
 * See also: `server/worker/src/db/schema.ts::exports` — D1 table definition
 * See also: `app/src/lib/export/` — client-side PDF generation
 * Do NOT: Generate PDFs server-side — client handles rendering
 */
import { Hono } from 'hono';
import type { Env } from '../../types';

const exportRoutes = new Hono<{ Bindings: Env }>();

/**
 * POST /exports — records an export event and optionally stores the artifact in R2.
 *
 * Accepts multipart form data with:
 * - briefingId: string (required)
 * - exportType: string (default: 'pdf')
 * - file: Blob (optional — the generated PDF/artifact)
 *
 * Upstream: `app/src/lib/export/` — sends after client-side PDF generation
 * Downstream: D1 `exports` table + R2 `EXPORTS_BUCKET`
 */
exportRoutes.post('/', async (c) => {
  const formData = await c.req.formData();
  const briefingId = formData.get('briefingId') as string;
  const exportType = (formData.get('exportType') as string) || 'pdf';
  const file = formData.get('file') as File | null;

  if (!briefingId) {
    return c.json({ error: 'briefingId required' }, 400);
  }

  const exportId = crypto.randomUUID();

  // Record in D1
  await c.env.DB.prepare(`
    INSERT INTO exports (id, briefing_id, export_type)
    VALUES (?, ?, ?)
  `).bind(exportId, briefingId, exportType).run();

  // Upload artifact to R2 if provided
  if (file && c.env.EXPORTS_BUCKET) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      await c.env.EXPORTS_BUCKET.put(`exports/${exportId}.${exportType}`, arrayBuffer, {
        httpMetadata: { contentType: file.type },
        customMetadata: { briefingId, exportType },
      });
    } catch (error) {
      console.error('R2 upload failed (non-fatal):', error);
    }
  }

  return c.json({ status: 'ok', id: exportId });
});

/**
 * GET /exports — lists recent exports for a briefing.
 */
exportRoutes.get('/', async (c) => {
  const briefingId = c.req.query('briefingId');
  const limit = Math.min(parseInt(c.req.query('limit') ?? '20', 10) || 20, 50);

  let sql = 'SELECT id, briefing_id, export_type, exported_at, metadata_json FROM exports';
  const binds: string[] = [];

  if (briefingId) {
    sql += ' WHERE briefing_id = ?';
    binds.push(briefingId);
  }

  sql += ' ORDER BY exported_at DESC LIMIT ?';
  binds.push(String(limit));

  const rows = await c.env.DB.prepare(sql).bind(...binds).all();

  return c.json(rows.results.map((row) => {
    const record = row as Record<string, string | null>;
    return {
      id: record.id,
      briefingId: record.briefing_id,
      exportType: record.export_type,
      exportedAt: record.exported_at,
      metadata: record.metadata_json ? JSON.parse(record.metadata_json) : null,
    };
  }));
});

export { exportRoutes };
