/**
 * Local briefing routes — reads briefing JSON files from the local filesystem.
 *
 * Provides `GET /briefings/latest` which scans `agent/briefings/` for JSON files,
 * groups by type, and returns the most recent briefing per type.
 *
 * Used by: `server/local/server.ts` — mounted at `/briefings`
 * See also: `server/worker/src/routes/briefings.ts` — cloud equivalent that reads from D1
 * Do NOT: Write to the briefings directory from these routes — read-only system
 */
import { Hono } from 'hono';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * Creates Hono routes for reading briefings from the local filesystem.
 *
 * @param options - Configuration object
 * @param options.briefingsDir - Absolute path to the `agent/briefings/` directory
 * @returns Hono app with briefing read routes
 *
 * Upstream: `server/local/server.ts` — mounts at `/briefings`
 * Downstream: Node `fs/promises` — reads `agent/briefings/*.json` files
 * Pattern: factory-route — returns a Hono sub-app configured with injected directory path
 */
export function createBriefingRoutes({ briefingsDir }: { briefingsDir: string }) {
  const app = new Hono();

  /** GET /latest — returns latest briefing per type from filesystem */
  app.get('/latest', async (c) => {
    const files = await readdir(briefingsDir).catch(() => []);
    const briefings: Record<string, unknown> = {};

    for (const file of files.sort().reverse()) {
      const match = file.match(/^\d{4}-\d{2}-\d{2}-\d{4}-(.+)\.json$/);
      if (!match) continue;
      const type = match[1];
      if (briefings[type]) continue;
      const raw = await readFile(resolve(briefingsDir, file), 'utf-8');
      briefings[type] = JSON.parse(raw);
    }

    return c.json(briefings);
  });

  return app;
}
