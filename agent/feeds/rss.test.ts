/**
 * Tests: `agent/feeds/rss.ts::fetchRssFeed`
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FeedSource } from './types';

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:dc="http://purl.org/dc/elements/1.1/" version="2.0">
<channel>
<title>Example Feed</title>
<item>
  <title><![CDATA[Test Post Title]]></title>
  <link>https://example.com/posts/abc123/test-post</link>
  <pubDate>Sat, 28 Mar 2026 16:27:25 GMT</pubDate>
  <dc:creator><![CDATA[Test Author]]></dc:creator>
  <description><![CDATA[<p>This is a <strong>test</strong> post with <a href="https://example.com">a link</a>.</p><figure><img src="test.png" alt="test"/></figure>]]></description>
</item>
<item>
  <title><![CDATA[Second Post]]></title>
  <link>https://example.com/posts/def456/second-post</link>
  <pubDate>Sat, 28 Mar 2026 14:00:00 GMT</pubDate>
  <dc:creator><![CDATA[Another Author]]></dc:creator>
  <description><![CDATA[<p>Second post content.</p>]]></description>
</item>
</channel>
</rss>`;

const SINGLE_ITEM_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:dc="http://purl.org/dc/elements/1.1/" version="2.0">
<channel>
<title>Example Feed</title>
<item>
  <title><![CDATA[Solo Post]]></title>
  <link>https://example.com/posts/xyz/solo</link>
  <pubDate>Sat, 28 Mar 2026 12:00:00 GMT</pubDate>
  <dc:creator><![CDATA[Solo Author]]></dc:creator>
  <description><![CDATA[<p>Solo content.</p>]]></description>
</item>
</channel>
</rss>`;

const testSource: FeedSource = {
  id: 'example-feed',
  name: 'Example Feed',
  kind: 'rss',
  feedUrl: 'https://example.com/feed.xml',
};

describe('fetchRssFeed', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses RSS XML into FeedItem array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(SAMPLE_RSS),
      }),
    );

    const { fetchRssFeed } = await import('./rss');
    const items = await fetchRssFeed(testSource);

    expect(items).toHaveLength(2);
    expect(items[0].source).toBe('example-feed');
    expect(items[0].title).toBe('Test Post Title');
    expect(items[0].author).toBe('Test Author');
    expect(items[0].url).toBe('https://example.com/posts/abc123/test-post');
    expect(items[0].kind).toBe('post');
    expect(items[0].publishedAt).toMatch(/2026-03-28/);
  });

  it('strips HTML from description, preserving text content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(SAMPLE_RSS),
      }),
    );

    const { fetchRssFeed } = await import('./rss');
    const items = await fetchRssFeed(testSource);

    expect(items[0].content).toContain('test');
    expect(items[0].content).toContain('a link');
    expect(items[0].content).not.toContain('<p>');
    expect(items[0].content).not.toContain('<strong>');
    expect(items[0].content).not.toContain('<figure>');
  });

  it('handles single-item feed (fast-xml-parser returns object, not array)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(SINGLE_ITEM_RSS),
      }),
    );

    const { fetchRssFeed } = await import('./rss');
    const items = await fetchRssFeed(testSource);

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Solo Post');
  });

  it('handles fetch failure gracefully', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      }),
    );

    const { fetchRssFeed } = await import('./rss');
    const items = await fetchRssFeed(testSource);

    expect(items).toEqual([]);
  });
});
