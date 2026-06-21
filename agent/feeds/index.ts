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
  const results = await Promise.all(
    sources.map((source) => {
      switch (source.kind) {
        case 'rss':
          return fetchRssFeed(source);
        case 'graphql':
          return fetchGraphqlFeed(source);
      }
    }),
  );

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
