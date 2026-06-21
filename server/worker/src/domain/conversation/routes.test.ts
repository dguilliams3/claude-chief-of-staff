import { describe, expect, it } from 'vitest';
import { conversations } from './routes';
import type { Env } from '../../types';

type ConversationRow = {
  id: string;
  display_name: string | null;
  tagline: string | null;
  avatar: string | null;
};

class FakeConversationDb {
  public readonly conversation: ConversationRow = {
    id: 'conv-1',
    display_name: 'Chief of Staff',
    tagline: 'Daily operator briefings',
    avatar: 'https://example.com/avatar.png',
  };

  prepare(sql: string) {
    return new FakePreparedStatement(this.conversation, sql);
  }
}

class FakePreparedStatement {
  private bindings: unknown[] = [];

  constructor(
    private readonly conversation: ConversationRow,
    private readonly sql: string,
  ) {}

  bind(...values: unknown[]) {
    this.bindings = values;
    return this;
  }

  async first() {
    if (this.sql.includes('SELECT id FROM conversations WHERE id = ?')) {
      return this.bindings[0] === this.conversation.id
        ? { id: this.conversation.id }
        : null;
    }

    throw new Error(`Unexpected first() SQL in test: ${this.sql}`);
  }

  async run() {
    if (!this.sql.includes('UPDATE conversations')) {
      throw new Error(`Unexpected run() SQL in test: ${this.sql}`);
    }

    const match = this.sql.match(/SET\s+([\s\S]+?)\s+WHERE/i);
    if (!match) {
      throw new Error(`Could not parse SET clause in test SQL: ${this.sql}`);
    }

    const assignments = match[1]
      .split(',')
      .map((part) => part.trim().split(/\s*=\s*/)[0])
      .filter(Boolean);

    const values = this.bindings.slice(0, -1);
    const conversationId = this.bindings[this.bindings.length - 1];

    if (conversationId !== this.conversation.id) {
      throw new Error(`Unexpected conversation id ${String(conversationId)} in test SQL`);
    }

    assignments.forEach((column, index) => {
      const value = values[index] as string | null;
      if (column === 'display_name') this.conversation.display_name = value;
      if (column === 'tagline') this.conversation.tagline = value;
      if (column === 'avatar') this.conversation.avatar = value;
    });

    return {
      success: true,
      meta: {
        changes: 1,
        duration: 0,
        last_row_id: 0,
        rows_read: 0,
        rows_written: 1,
      },
    };
  }
}

describe('conversation identity patching', () => {
  it('preserves sibling identity fields on partial PATCH', async () => {
    const db = new FakeConversationDb();
    const env = { DB: db } as unknown as Env;

    const response = await conversations.request(
      '/conv-1',
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tagline: 'Ship the next release' }),
      },
      env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: 'conv-1',
      tagline: 'Ship the next release',
    });

    expect(db.conversation).toEqual({
      id: 'conv-1',
      display_name: 'Chief of Staff',
      tagline: 'Ship the next release',
      avatar: 'https://example.com/avatar.png',
    });
  });
});
