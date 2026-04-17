/**
 * RSS feed fetcher — parses RSS XML into FeedItem arrays.
 *
 * Used by: `agent/feeds/index.ts`
 */
import { XMLParser } from 'fast-xml-parser';
import { convert } from 'html-to-text';
import type { FeedSource, FeedItem } from './types';

const parser = new XMLParser({
  ignoreAttributes: false,
  cdataPropName: '__cdata',
});

function extractText(field: unknown): string {
  if (typeof field === 'string') return field;
  if (field && typeof field === 'object' && '__cdata' in field) {
    return String((field as Record<string, unknown>).__cdata);
  }
  return '';
}

function stripHtml(html: string): string {
  return convert(html, {
    wordwrap: false,
    selectors: [
      { selector: 'img', format: 'skip' },
      { selector: 'figure', format: 'skip' },
    ],
  }).trim();
}

/**
 * Fetch and parse an RSS feed into FeedItem[].
 * Returns an empty array on failure.
 */
export async function fetchRssFeed(
  source: Extract<FeedSource, { kind: 'rss' }>,
): Promise<FeedItem[]> {
  let response: Response;
  try {
    response = await fetch(source.feedUrl);
  } catch {
    console.error(`[feeds] Failed to fetch ${source.name}: network error`);
    return [];
  }

  if (!response.ok) {
    console.error(
      `[feeds] Failed to fetch ${source.name}: ${response.status} ${response.statusText}`,
    );
    return [];
  }

  const xml = await response.text();
  const parsed = parser.parse(xml);
  const rawItems = parsed?.rss?.channel?.item;
  if (!rawItems) return [];

  const items = Array.isArray(rawItems) ? rawItems : [rawItems];

  return items.map(
    (item: Record<string, unknown>): FeedItem => ({
      source: source.id,
      url: String(item.link ?? ''),
      title: extractText(item.title),
      author: extractText(item['dc:creator']),
      publishedAt: new Date(String(item.pubDate ?? '')).toISOString(),
      content: stripHtml(extractText(item.description)),
      kind: 'post',
    }),
  );
}
