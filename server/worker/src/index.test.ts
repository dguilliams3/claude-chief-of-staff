import { describe, expect, it } from 'vitest';
import app from './index';
import type { Env } from './types';

class FakeDb {
  prepare(sql: string) {
    return new FakePreparedStatement(sql);
  }
}

class FakePreparedStatement {
  constructor(private readonly sql: string) {}

  bind(..._values: unknown[]) {
    return this;
  }

  async all() {
    if (this.sql.includes('SELECT id, type, generated_at, sections_json, metadata_json')) {
      return {
        results: [
          {
            id: 'briefing-1',
            type: 'work',
            generated_at: '2026-06-21T09:00:00Z',
            sections_json: JSON.stringify([{ key: 'w1', label: 'Work', content: 'Stable', severity: 'info' }]),
            metadata_json: JSON.stringify({ briefingNumber: 1 }),
          },
        ],
      };
    }

    throw new Error(`Unexpected all() SQL in index test: ${this.sql}`);
  }
}

describe('worker CORS exposure', () => {
  it('exposes the ETag header to the Pages client on briefing reads', async () => {
    const env = {
      DB: new FakeDb(),
      COS_TOKEN: 'secret-token',
      CORS_ORIGIN: 'https://pages.example',
    } as unknown as Env;

    const response = await app.request(
      '/briefings',
      {
        method: 'GET',
        headers: {
          Origin: 'https://pages.example',
          Authorization: 'Bearer secret-token',
        },
      },
      env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://pages.example');
    expect(response.headers.get('access-control-expose-headers')).toContain('ETag');
    expect(response.headers.get('ETag')).toBeTruthy();
  });
});
