/**
 * Feed orchestrator — fetches configured sources and serializes feed items.
 *
 * Used by: `agent/run-briefing.ts` (community pre-fetch)
 */
import type { FeedSource, FeedItem } from './types';
import { fetchRssFeed } from './rss';
import { fetchGraphqlFeed } from './graphql';

export type { FeedSource, FeedItem } from './types';

/**
 * Fetch items from all provided sources in parallel.
 * Returns combined FeedItem[] sorted by publishedAt descending.
 */
export async function fetchAllSources(sources: FeedSource[]): Promise<FeedItem[]> {
  // allSettled (not all): one rejected source must not discard the feeds that
  // already resolved. Rejected sources are logged and contribute zero items.
  const settled = await Promise.allSettled(
    sources.map((source) => {
      switch (source.kind) {
        case 'rss':
          return fetchRssFeed(source);
        case 'graphql':
          return fetchGraphqlFeed(source);
      }
    }),
  );

  const results: FeedItem[][] = [];
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      results.push(result.value ?? []);
    } else {
      console.error('[feeds] Source failed:', result.reason);
    }
  }

  return results
    .flat()
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}

/**
 * Serialize FeedItem[] into a prompt-injection text block.
 */
export function serializeFeedItems(items: FeedItem[]): string {
  return items
    .map(
      (item) =>
        `### ${item.title} — ${item.author} (${item.source})\nURL: ${item.url}\nPublished: ${item.publishedAt}\n\n${item.content}`,
    )
    .join('\n\n---\n\n');
}
