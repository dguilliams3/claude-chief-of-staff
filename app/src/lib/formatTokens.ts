/**
 * Formats raw token counts into compact K/M notation for lightweight UI metadata.
 *
 * Upstream: `app/src/components/AppHeader/AppHeader.tsx`
 * Upstream: `app/src/components/AppHeader/SessionDropdown.tsx`
 * Upstream: `app/src/components/FollowUpBar/ChatPicker.tsx`
 * Upstream: `app/src/views/ChatsView/ChatsView.tsx`
 * Do NOT: Inline divergent token-formatting rules in multiple components.
 */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}
