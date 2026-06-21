/**
 * Suggestion catalog for Community Feed setup. NOT defaults — users pick
 * from this list (or write their own) during setup-instance, writing their
 * selections to `local/feeds.json` which the runtime reads via `readLocalFeeds()`.
 */
import type { FeedSource } from './types';

type SuggestedFeedSource = FeedSource & {
  suggestionLabel: string;
  suggestionDescription: string;
  template: true;
};

export const SUGGESTION_CATALOG: SuggestedFeedSource[] = [
  {
    id: 'finance-marginal-revolution',
    name: 'Marginal Revolution',
    kind: 'rss',
    feedUrl: 'https://marginalrevolution.com/feed',
    suggestionLabel: 'Finance',
    suggestionDescription: 'Macro, markets, and policy commentary for financial context.',
    template: true,
  },
  {
    id: 'science-quanta',
    name: 'Quanta Magazine',
    kind: 'rss',
    feedUrl: 'https://www.quantamagazine.org/feed/',
    suggestionLabel: 'Science',
    suggestionDescription: 'Research-driven science reporting across physics, biology, and math.',
    template: true,
  },
  {
    id: 'biotech-stat-news',
    name: 'STAT News: Biotech',
    kind: 'rss',
    feedUrl: 'https://www.statnews.com/category/biotech/feed/',
    suggestionLabel: 'Biotech',
    suggestionDescription: 'Biotech industry updates, funding, clinical results, and regulation.',
    template: true,
  },
  {
    id: 'geopolitics-war-on-the-rocks',
    name: 'War on the Rocks',
    kind: 'rss',
    feedUrl: 'https://warontherocks.com/feed/',
    suggestionLabel: 'Geopolitics',
    suggestionDescription: 'Defense strategy, security policy, and geopolitical analysis.',
    template: true,
  },
  {
    id: 'rationalism-ai-lesswrong',
    name: 'LessWrong',
    kind: 'graphql',
    graphqlUrl: 'https://www.lesswrong.com/graphql',
    baseUrl: 'https://www.lesswrong.com',
    limit: 20,
    suggestionLabel: 'Rationalism / AI',
    suggestionDescription: 'Long-form rationality, forecasting, and AI alignment discussion.',
    template: true,
  },
  {
    id: 'custom-rss-template',
    name: 'Custom RSS Feed (replace URL)',
    kind: 'rss',
    feedUrl: 'https://example.com/feed.xml',
    suggestionLabel: 'Custom RSS',
    suggestionDescription: 'Template slot for any RSS feed URL the user wants to track.',
    template: true,
  },
];
