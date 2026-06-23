/**
 * Surface-state regression tests for recruiter-visible main views.
 *
 * Tests: `app/src/views/TodayView/TodayView.tsx::TodayView`
 * Tests: `app/src/views/HistoryView/HistoryView.tsx::HistoryView`
 * Tests: `app/src/views/ChatsView/ChatsView.tsx::ChatsView`
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

let mockState: Record<string, unknown> = {};

vi.mock('@/store', () => ({
  useStore: (selector: (state: Record<string, unknown>) => unknown) => selector(mockState),
}));

vi.mock('@/components/SectionCard', () => ({
  SectionCard: () => <div>section-card</div>,
}));

vi.mock('@/components/FollowUpBar', () => ({
  FollowUpBar: () => <div>follow-up-bar</div>,
}));

vi.mock('@/components/RunningBanner', () => ({
  RunningBanner: () => <div>running-banner</div>,
}));

vi.mock('@/components/BriefingList', () => ({
  BriefingList: () => <div>briefing-list</div>,
}));

vi.mock('@/components/Skeleton', () => ({
  Skeleton: () => <div>skeleton</div>,
}));

vi.mock('@/lib/export', () => ({
  generateAndDownloadPdf: vi.fn(),
}));

vi.mock('./ChatsView/ConversationDetail', () => ({
  ConversationDetail: () => <div>conversation-detail</div>,
}));

vi.mock('@/lib/formatTokens', () => ({
  formatTokens: () => '10',
}));

describe('main-surface state completeness', () => {
  beforeEach(() => {
    mockState = {
      activeType: 'work',
      briefings: {},
      briefingsError: null,
      activeTrigger: null,
      triggerBriefing: vi.fn(),
      refresh: vi.fn(),
      historyList: [],
      historyLoading: false,
      historyError: null,
      fetchHistory: vi.fn(),
      selectedBriefing: null,
      selectedBriefingId: null,
      selectedBriefingError: null,
      selectBriefing: vi.fn(),
      conversations: [],
      conversationsLoading: false,
      conversationsError: null,
      selectedConversation: null,
      fetchConversations: vi.fn(),
      selectConversation: vi.fn(),
      createConversation: vi.fn(),
    };
  });

  it('shows a retryable error state in TodayView when latest briefings fail to load', async () => {
    mockState = {
      ...mockState,
      briefingsError: 'Could not load the latest briefings. Try again.',
    };
    const { TodayView } = await import('@/views/TodayView');

    const html = renderToStaticMarkup(<TodayView />);
    expect(html).toContain("Couldn&#x27;t load the work briefing");
    expect(html).toContain('Retry');
    expect(html).not.toContain('No work briefing yet.');
  });

  it('shows a retryable error state in HistoryView when history loading fails', async () => {
    mockState = {
      ...mockState,
      historyError: 'Could not load briefing history. Try again.',
    };
    const { HistoryView } = await import('@/views/HistoryView');

    const html = renderToStaticMarkup(<HistoryView />);
    expect(html).toContain("Couldn&#x27;t load briefing history");
    expect(html).toContain('Retry');
    expect(html).not.toContain('Past Briefings');
  });

  it('shows a retryable error state in ChatsView when chats loading fails', async () => {
    mockState = {
      ...mockState,
      conversationsError: 'Could not load chats. Try again.',
    };
    const { ChatsView } = await import('@/views/ChatsView');

    const html = renderToStaticMarkup(<ChatsView />);
    expect(html).toContain("Couldn&#x27;t load chats");
    expect(html).toContain('Retry');
    expect(html).not.toContain('No conversations yet.');
  });
});
