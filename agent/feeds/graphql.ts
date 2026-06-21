/**
 * GraphQL feed fetcher — queries a GraphQL API for recent posts.
 *
 * Used by: `agent/feeds/index.ts`
 */
import type { FeedSource, FeedItem } from './types';

const POSTS_QUERY = `
  query RecentPosts($limit: Int) {
    posts(input: { terms: { limit: $limit, sortedBy: "new" } }) {
      results {
        title
        slug
        postedAt
        baseScore
        voteCount
        commentCount
        wordCount
        user { displayName }
        contents { markdown }
      }
    }
  }
`;

const CONTENT_TRUNCATE_LENGTH = 1500;

/**
 * Fetch recent posts from a GraphQL endpoint.
 */
export async function fetchGraphqlFeed(
  source: Extract<FeedSource, { kind: 'graphql' }>,
): Promise<FeedItem[]> {
  const response = await fetch(source.graphqlUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: POSTS_QUERY,
      variables: { limit: source.limit ?? 20 },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `GraphQL fetch failed for ${source.name}: ${response.status} ${response.statusText}`,
    );
  }

  const json = (await response.json()) as {
    data?: {
      posts?: {
        results?: Array<{
          title: string;
          slug: string;
          postedAt: string;
          baseScore: number;
          voteCount: number;
          commentCount: number;
          wordCount: number;
          user?: { displayName: string };
          contents?: { markdown: string };
        }>;
      };
    };
  };

  const posts = json.data?.posts?.results ?? [];

  return posts.map((post) => {
    const markdown = post.contents?.markdown ?? '';
    const truncated =
      markdown.length > CONTENT_TRUNCATE_LENGTH
        ? `${markdown.slice(0, CONTENT_TRUNCATE_LENGTH)}\n\n[...truncated]`
        : markdown;

    return {
      source: source.name,
      url: `${source.baseUrl}/posts/${post.slug}`,
      title: post.title,
      author: post.user?.displayName ?? 'Unknown',
      publishedAt: post.postedAt,
      content: `Score: ${post.baseScore} | Comments: ${post.commentCount} | Words: ${post.wordCount}\n\n${truncated}`,
      kind: 'post' as const,
    };
  });
}
