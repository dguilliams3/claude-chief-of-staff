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
      id: 'briefing-3',
      type: 'news',
      generated_at: '2026-06-22T14:00:00Z',
      session_id: 'session-3',
      sections_json: JSON.stringify([{ key: 'n2', label: 'News', content: 'Latest', severity: 'warn' }]),
      metadata_json: JSON.stringify({ briefingNumber: 3 }),
    },
    {
      id: 'briefing-2',
      type: 'community',
      generated_at: '2026-06-21T14:00:00Z',
      session_id: 'session-2',
      sections_json: JSON.stringify([{ key: 'c1', label: 'Community', content: 'Middle', severity: 'info' }]),
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
    await expect(first.json()).resolves.toHaveLength(3);

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
    expect(etag).toMatch(/^"briefing:briefing-2:/);

    const second = await briefings.request(
      '/briefing-2',
      { headers: { 'if-none-match': etag! } },
      env,
    );
    expect(second.status).toBe(304);
    expect(second.headers.get('ETag')).toBe(etag);
  });

  it('changes the history-list ETag when a non-boundary row changes', async () => {
    const db = new FakeBriefingDb();
    const env = { DB: db } as unknown as Env;

    const first = await briefings.request('/', {}, env);
    const firstEtag = first.headers.get('ETag');

    db.rows[1] = {
      ...db.rows[1],
      metadata_json: JSON.stringify({ briefingNumber: 22 }),
    };

    const second = await briefings.request('/', {}, env);
    const secondEtag = second.headers.get('ETag');

    expect(firstEtag).toBeTruthy();
    expect(secondEtag).toBeTruthy();
    expect(secondEtag).not.toBe(firstEtag);
  });

  it('changes the detail ETag when the returned payload changes without changing the timestamp', async () => {
    const db = new FakeBriefingDb();
    const env = { DB: db } as unknown as Env;

    const first = await briefings.request('/briefing-2', {}, env);
    const firstEtag = first.headers.get('ETag');

    db.rows[1] = {
      ...db.rows[1],
      sections_json: JSON.stringify([{ key: 'c1', label: 'Community', content: 'Updated', severity: 'warn' }]),
    };

    const second = await briefings.request('/briefing-2', {}, env);
    const secondEtag = second.headers.get('ETag');

    expect(firstEtag).toBeTruthy();
    expect(secondEtag).toBeTruthy();
    expect(secondEtag).not.toBe(firstEtag);
  });
});
