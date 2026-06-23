/**
 * Skeleton — gradient-pulse loading placeholder primitive.
 *
 * PRESENTATIONAL. Renders a sized div with a left-to-right shimmer animation
 * over the `bg-surface-raised` Warm Stone token. Use anywhere a real component
 * is about to render but data is still in flight — preserves layout shape so
 * the user doesn't see a centered "Loading X..." text and then a sudden content
 * paint. Especially important for 2-5 min briefing generations, where the
 * card outline + a few text-line skeletons set expectations vastly better than
 * a single line of muted text.
 *
 * Accessibility: rendered with `role="status"` + `aria-label="Loading"`.
 * Multiple skeletons in a list can pass `decorative` (drops the role/aria so
 * only the outer group announces itself once).
 *
 * Reduced motion: the `prefers-reduced-motion: reduce` rule in
 * `app/src/index.css` neutralizes the shimmer animation
 * (`@keyframes skeleton-shimmer` / `.animate-skeleton-shimmer`), so users with
 * the reduced-motion preference set see a static `bg-surface-raised` rectangle,
 * which still preserves layout shape — no per-component handling needed here.
 *
 * Used by: `app/src/views/HistoryView/HistoryView.tsx`
 * See also: `app/src/index.css` -- `@keyframes skeleton-shimmer` + `.animate-skeleton-shimmer`
 * Do NOT: Reach for `react-loading-skeleton` or similar -- pure Tailwind only.
 * Do NOT: Add per-component prefers-reduced-motion handling -- the global rule
 *         in index.css already covers it.
 */
import type { CSSProperties } from 'react';

/**
 * Radius token mapping. `card` matches `Card` primitive radius, `full` matches
 * pill/avatar radii, `none` for square placeholders (e.g., header chips).
 *
 * `bubble-left` / `bubble-right` mirror `ChatBubble` geometry exactly:
 * `rounded-2xl` with the tail-side bottom corner flattened (`rounded-bl-sm` for
 * assistant/left bubbles, `rounded-br-sm` for user/right bubbles). Use these so
 * a chat-history skeleton matches the shape of the content it precedes — the
 * placeholder and the real thread share one silhouette, so the swap reads as a
 * fill rather than a reshape. Color stays `bg-surface-raised` regardless of
 * side: skeletons are neutral, accent is reserved for real interactive content.
 */
type SkeletonRounded = 'full' | 'card' | 'none' | 'bubble-left' | 'bubble-right';

const ROUNDED_CLASS: Record<SkeletonRounded, string> = {
  full: 'rounded-full',
  card: 'rounded-card',
  none: '',
  'bubble-left': 'rounded-2xl rounded-bl-sm',
  'bubble-right': 'rounded-2xl rounded-br-sm',
};

export interface SkeletonProps {
  /** CSS width — number is treated as pixels. Default '100%'. */
  width?: string | number;
  /** CSS height — number is treated as pixels. Default '1rem'. */
  height?: string | number;
  /**
   * Border radius preset. Default 'card'. `bubble-left` / `bubble-right` render
   * ChatBubble-shaped placeholders (rounded-2xl with the tail-side bottom corner
   * flattened) for chat-history skeletons.
   */
  rounded?: SkeletonRounded;
  /** Extra Tailwind classes to merge onto the outer div. */
  className?: string;
  /**
   * When true, drops `role="status"` + `aria-label`. Use for child skeletons
   * inside an outer skeleton group that announces loading state once. Default false.
   */
  decorative?: boolean;
}

/**
 * Render a single skeleton placeholder rectangle with shimmer animation.
 *
 * @param width   -- CSS width; number → pixels. Default '100%'.
 * @param height  -- CSS height; number → pixels. Default '1rem'.
 * @param rounded -- Radius preset: 'card' (default), 'full', 'none', or the
 *   ChatBubble-shaped 'bubble-left' / 'bubble-right'.
 * @param className -- Extra classes appended after defaults.
 * @param decorative -- When true, omit ARIA role/label (use inside groups).
 *
 * Upstream: see file header for the call-sites.
 * Downstream: leaf — no other components.
 * Pattern: token-only -- relies on `bg-surface-raised` + `animate-skeleton-shimmer`
 *          from `app/src/index.css`. No inline gradient — CSS owns the shimmer.
 */
export function Skeleton({
  width = '100%',
  height = '1rem',
  rounded = 'card',
  className = '',
  decorative = false,
}: SkeletonProps) {
  const style: CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
  };

  const ariaProps = decorative
    ? { 'aria-hidden': true as const }
    : { role: 'status' as const, 'aria-label': 'Loading' };

  return (
    <div
      {...ariaProps}
      style={style}
      className={`bg-surface-raised animate-skeleton-shimmer ${ROUNDED_CLASS[rounded]} ${className}`.trim()}
    />
  );
}
