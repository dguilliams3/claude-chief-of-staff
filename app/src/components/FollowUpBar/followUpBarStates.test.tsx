/**
 * Recruiter-visible state tests for the follow-up bar.
 *
 * Tests: `app/src/components/FollowUpBar/FollowUpBar.tsx::FollowUpBar`
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

let mockState: Record<string, unknown> = {};

vi.mock('@/store', () => ({
  useStore: (selector: (state: Record<string, unknown>) => unknown) => selector(mockState),
}));

vi.mock('@/components/ChatThread', () => ({
  ChatThread: () => <div>chat-thread</div>,
  ChatInput: () => <div>chat-input</div>,
}));

vi.mock('./DrawerHandle', () => ({
  DrawerHandle: () => <div>drawer-handle</div>,
}));

vi.mock('./ChatPicker', () => ({
  ChatPicker: () => <div>chat-picker</div>,
}));

vi.mock('./hooks/useDrawer', () => ({
  useDrawer: () => ({
    isExpanded: false,
    expand: vi.fn(),
    collapse: vi.fn(),
    toggle: vi.fn(),
  }),
}));

describe('FollowUpBar state completeness', () => {
  beforeEach(() => {
    mockState = {
      activeConversationId: null,
      followUpHistory: {},
      followUpHydrating: {},
      followUpBarErrors: {},
      pendingFollowUps: {},
      sendFollowUp: vi.fn(),
      hydrateFollowUpHistory: vi.fn(),
      prefillQuestion: null,
      setPrefillQuestion: vi.fn(),
    };
  });

  it('shows a retryable error state when follow-up history hydration fails', async () => {
    mockState = {
      ...mockState,
      followUpBarErrors: {
        'b-001': 'Could not load follow-up chats. Try again.',
      },
    };
    const { FollowUpBar } = await import('./FollowUpBar');

    const html = renderToStaticMarkup(
      <FollowUpBar briefingId="b-001" sessionId="sess-001" />,
    );

    expect(html).toContain('Could not load follow-up chats. Try again.');
    expect(html).toContain('Retry');
  });
});
