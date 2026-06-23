import { describe, expect, it } from 'vitest';
import { conversations } from './routes';
import type { Env } from '../../types';

type ConversationIdentityRow = {
  id: string;
  display_name: string | null;
  tagline: string | null;
  avatar: string | null;
};

type ConversationListRow = {
  id: string;
  session_id: string | null;
  briefing_id: string | null;
  name: string | null;
  display_name: string | null;
  tagline: string | null;
  avatar: string | null;
  created_at: string;
  last_message_at: string | null;
  message_count: number;
  total_tokens: number | null;
  context_window: number | null;
  briefing_type: string | null;
  briefing_generated_at: string | null;
};

type ConversationMessageRow = {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  created_at: string;
};

class FakeConversationDb {
  public readonly conversation: ConversationIdentityRow = {
    id: 'conv-1',
    display_name: 'Chief of Staff',
    tagline: 'Daily operator briefings',
    avatar: 'https://example.com/avatar.png',
  };

  public listRows: ConversationListRow[] = [
    {
      id: 'conv-1',
      session_id: 'session-1',
      briefing_id: 'briefing-1',
      name: 'Morning follow-up',
      display_name: 'Chief of Staff',
      tagline: 'Daily operator briefings',
      avatar: 'https://example.com/avatar.png',
      created_at: '2026-06-22T09:00:00Z',
      last_message_at: '2026-06-22T09:15:00Z',
      message_count: 2,
      total_tokens: 1200,
      context_window: 200000,
      briefing_type: 'work',
      briefing_generated_at: '2026-06-22T08:55:00Z',
    },
    {
      id: 'conv-2',
      session_id: null,
      briefing_id: null,
      name: null,
      display_name: null,
      tagline: null,
      avatar: null,
      created_at: '2026-06-22T08:00:00Z',
      last_message_at: null,
      message_count: 0,
      total_tokens: null,
      context_window: null,
      briefing_type: null,
      briefing_generated_at: null,
    },
  ];

  public messagesByConversation: Record<string, ConversationMessageRow[]> = {
    'conv-1': [
      {
        id: 'msg-1',
        conversation_id: 'conv-1',
        role: 'user',
        content: 'What changed?',
        created_at: '2026-06-22T09:10:00Z',
      },
      {
        id: 'msg-2',
        conversation_id: 'conv-1',
        role: 'assistant',
        content: 'The briefing is greener now.',
        created_at: '2026-06-22T09:15:00Z',
      },
    ],
    'conv-2': [],
  };

  prepare(sql: string) {
    return new FakePreparedStatement(this, sql);
  }
}

class FakePreparedStatement {
  private bindings: unknown[] = [];

  constructor(
    private readonly db: FakeConversationDb,
    private readonly sql: string,
  ) {}

  bind(...values: unknown[]) {
    this.bindings = values;
    return this;
  }

  async all() {
    if (this.sql.includes('FROM conversations c') && this.sql.includes('LEFT JOIN briefings b')) {
      return { results: this.db.listRows };
    }

    if (this.sql.includes('FROM messages') && this.sql.includes('WHERE conversation_id = ?')) {
      const conversationId = this.bindings[0] as string;
      return { results: this.db.messagesByConversation[conversationId] ?? [] };
    }

    if (this.sql.includes('WHERE c.briefing_id = ?')) {
      const briefingId = this.bindings[0] as string;
      return {
        results: this.db.listRows.filter((row) => row.briefing_id === briefingId),
      };
    }

    throw new Error(`Unexpected all() SQL in conversation test: ${this.sql}`);
  }

  async first() {
    if (this.sql.includes('SELECT id FROM conversations WHERE id = ?')) {
      return this.bindings[0] === this.db.conversation.id
        ? { id: this.db.conversation.id }
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

    if (conversationId !== this.db.conversation.id) {
      throw new Error(`Unexpected conversation id ${String(conversationId)} in test SQL`);
    }

    assignments.forEach((column, index) => {
      const value = values[index] as string | null;
      if (column === 'display_name') this.db.conversation.display_name = value;
      if (column === 'tagline') this.db.conversation.tagline = value;
      if (column === 'avatar') this.db.conversation.avatar = value;
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

describe('conversation route ETags', () => {
  it('returns a stable ETag for the conversations list and honors If-None-Match', async () => {
    const env = { DB: new FakeConversationDb() } as unknown as Env;

    const first = await conversations.request('/', {}, env);
    expect(first.status).toBe(200);
    const etag = first.headers.get('ETag');
    expect(etag).toBeTruthy();

    const second = await conversations.request(
      '/',
      { headers: { 'if-none-match': etag! } },
      env,
    );
    expect(second.status).toBe(304);
    expect(second.headers.get('ETag')).toBe(etag);
  });

  it('changes the conversations list ETag when the returned aggregate payload changes', async () => {
    const db = new FakeConversationDb();
    const env = { DB: db } as unknown as Env;

    const first = await conversations.request('/', {}, env);
    const firstEtag = first.headers.get('ETag');

    db.listRows[0] = {
      ...db.listRows[0],
      message_count: 3,
      last_message_at: '2026-06-22T09:20:00Z',
    };

    const second = await conversations.request('/', {}, env);
    const secondEtag = second.headers.get('ETag');

    expect(firstEtag).toBeTruthy();
    expect(secondEtag).toBeTruthy();
    expect(secondEtag).not.toBe(firstEtag);
  });

  it('returns a stable ETag for conversation messages and honors If-None-Match', async () => {
    const env = { DB: new FakeConversationDb() } as unknown as Env;

    const first = await conversations.request('/conv-1/messages', {}, env);
    expect(first.status).toBe(200);
    const etag = first.headers.get('ETag');
    expect(etag).toMatch(/^"conversation-messages:conv-1:200:/);

    const second = await conversations.request(
      '/conv-1/messages',
      { headers: { 'if-none-match': etag! } },
      env,
    );
    expect(second.status).toBe(304);
    expect(second.headers.get('ETag')).toBe(etag);
  });

  it('changes the messages ETag when a message payload changes without changing the row count', async () => {
    const db = new FakeConversationDb();
    const env = { DB: db } as unknown as Env;

    const first = await conversations.request('/conv-1/messages', {}, env);
    const firstEtag = first.headers.get('ETag');

    db.messagesByConversation['conv-1'][1] = {
      ...db.messagesByConversation['conv-1'][1],
      content: 'The recruiter-facing chat path is calmer now.',
    };

    const second = await conversations.request('/conv-1/messages', {}, env);
    const secondEtag = second.headers.get('ETag');

    expect(firstEtag).toBeTruthy();
    expect(secondEtag).toBeTruthy();
    expect(secondEtag).not.toBe(firstEtag);
  });

  it('returns a stable ETag for by-briefing conversation lookups and honors If-None-Match', async () => {
    const env = { DB: new FakeConversationDb() } as unknown as Env;

    const first = await conversations.request('/by-briefing/briefing-1', {}, env);
    expect(first.status).toBe(200);
    const etag = first.headers.get('ETag');
    expect(etag).toMatch(/^"conversations-by-briefing:briefing-1:/);

    const second = await conversations.request(
      '/by-briefing/briefing-1',
      { headers: { 'if-none-match': etag! } },
      env,
    );
    expect(second.status).toBe(304);
    expect(second.headers.get('ETag')).toBe(etag);
  });
});
