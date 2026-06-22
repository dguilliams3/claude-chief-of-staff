import { describe, expect, it } from 'vitest';
import { briefings } from './routes';
import type { Env } from '../../types';

type BriefingRow = {
  id: string;
  type: string;
  generated_at: string;
  session_id: string;
  sections_json: string;
  metadata_json: string;
};

class FakeBriefingDb {
  readonly rows: BriefingRow[] = [
    {
      id: 'briefing-2',
      type: 'news',
      generated_at: '2026-06-21T14:00:00Z',
      session_id: 'session-2',
      sections_json: JSON.stringify([{ key: 'n1', label: 'News', content: 'Fresh', severity: 'warn' }]),
      metadata_json: JSON.stringify({ briefingNumber: 2 }),
    },
    {
      id: 'briefing-1',
      type: 'work',
      generated_at: '2026-06-20T09:00:00Z',
      session_id: 'session-1',
      sections_json: JSON.stringify([{ key: 'w1', label: 'Work', content: 'Stable', severity: 'info' }]),
      metadata_json: JSON.stringify({ briefingNumber: 1 }),
    },
  ];

  prepare(sql: string) {
    return new FakePreparedStatement(this.rows, sql);
  }
}

class FakePreparedStatement {
  private bindings: unknown[] = [];

  constructor(
    private readonly rows: BriefingRow[],
    private readonly sql: string,
  ) {}

  bind(...values: unknown[]) {
    this.bindings = values;
    return this;
  }

  async all() {
    if (this.sql.includes('SELECT id, type, generated_at, sections_json, metadata_json')) {
      return { results: this.rows };
    }

    throw new Error(`Unexpected all() SQL in briefing test: ${this.sql}`);
  }

  async first() {
    if (this.sql.includes('SELECT * FROM briefings WHERE id = ?')) {
      return this.rows.find((row) => row.id === this.bindings[0]) ?? null;
    }

    throw new Error(`Unexpected first() SQL in briefing test: ${this.sql}`);
  }
}

describe('briefing route ETags', () => {
  it('returns a stable ETag for the history list and honors If-None-Match', async () => {
    const env = { DB: new FakeBriefingDb() } as unknown as Env;

    const first = await briefings.request('/', {}, env);
    expect(first.status).toBe(200);
    const etag = first.headers.get('ETag');
    expect(etag).toBeTruthy();
    await expect(first.json()).resolves.toHaveLength(2);

    const second = await briefings.request(
      '/',
      { headers: { 'if-none-match': etag! } },
      env,
    );
    expect(second.status).toBe(304);
    expect(second.headers.get('ETag')).toBe(etag);
  });

  it('returns a stable ETag for briefing detail and honors If-None-Match', async () => {
    const env = { DB: new FakeBriefingDb() } as unknown as Env;

    const first = await briefings.request('/briefing-2', {}, env);
    expect(first.status).toBe(200);
    const etag = first.headers.get('ETag');
    expect(etag).toBe('"briefing:briefing-2:2026-06-21T14:00:00Z"');

    const second = await briefings.request(
      '/briefing-2',
      { headers: { 'if-none-match': etag! } },
      env,
    );
    expect(second.status).toBe(304);
    expect(second.headers.get('ETag')).toBe(etag);
  });
});
