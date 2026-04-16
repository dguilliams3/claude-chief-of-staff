/**
 * Feed system types — source definitions and uniform FeedItem shape.
 *
 * Used by: `agent/feeds/index.ts`, `agent/feeds/rss.ts`, `agent/feeds/graphql.ts`
 */

/** A content source where we fetch posts from. Discriminated on `kind`. */
export type FeedSource =
  | { id: string; name: string; kind: 'rss'; feedUrl: string }
  | {
      id: string;
      name: string;
      kind: 'graphql';
      graphqlUrl: string;
      baseUrl: string;
      limit?: number;
    };

/** A single piece of content from any source in a uniform shape. */
export type FeedItem = {
  source: string;
  url: string;
  title: string;
  author: string;
  publishedAt: string;
  content: string;
  kind: 'post';
};
