/**
 * Tests: `agent/feeds/index.ts::fetchAllSources`, `agent/feeds/index.ts::serializeFeedItems`
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FeedItem, FeedSource } from './types';

const mockItems: FeedItem[] = [
  {
    source: 'source-a',
    url: 'https://example.com/a',
    title: 'Test Post',
    author: 'Test Author',
    publishedAt: '2026-03-28T16:00:00.000Z',
    content: 'Test content here.',
    kind: 'post',
  },
  {
    source: 'source-b',
    url: 'https://example.com/b',
    title: 'Older Post',
    author: 'Older Author',
    publishedAt: '2026-03-28T14:00:00.000Z',
    content: 'Older content.',
    kind: 'post',
  },
];

const sources: FeedSource[] = [
  { id: 'source-a', name: 'Source A', kind: 'graphql', graphqlUrl: 'https://example.com/graphql', baseUrl: 'https://example.com' },
  { id: 'source-b', name: 'Source B', kind: 'graphql', graphqlUrl: 'https://example.org/graphql', baseUrl: 'https://example.org' },
];

describe('serializeFeedItems', () => {
  it('formats items as labeled text blocks with URLs', async () => {
    const { serializeFeedItems } = await import('./index');
    const result = serializeFeedItems(mockItems);

    expect(result).toContain('Test Post');
    expect(result).toContain('Test Author');
    expect(result).toContain('source-a');
    expect(result).toContain('https://example.com/a');
    expect(result).toContain('Test content here.');
    expect(result).toContain('Older Post');
  });
});

describe('fetchAllSources', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('fetches from all sources and sorts by publishedAt descending', async () => {
    vi.resetModules();
    vi.doMock('./graphql', () => ({
      fetchGraphqlFeed: vi.fn().mockImplementation((source: { id: string }) => {
        if (source.id === 'source-a') return Promise.resolve([mockItems[0]]);
        if (source.id === 'source-b') return Promise.resolve([mockItems[1]]);
        return Promise.resolve([]);
      }),
    }));

    const { fetchAllSources } = await import('./index');
    const items = await fetchAllSources(sources);

    expect(items).toHaveLength(2);
    expect(items[0].title).toBe('Test Post');
    expect(items[1].title).toBe('Older Post');
  });
});
