/**
 * useDrawer — manages expand/collapse state for the follow-up drawer.
 *
 * Returns `isExpanded` boolean and `expand`/`collapse`/`toggle` actions.
 * The drawer auto-expands when `expand()` is called (e.g., on message send).
 *
 * Used by: `@/components/FollowUpBar/FollowUpBar.tsx`
 */
import { useState, useCallback } from 'react';

export function useDrawer() {
  const [isExpanded, setIsExpanded] = useState(false);

  const expand = useCallback(() => setIsExpanded(true), []);
  const collapse = useCallback(() => setIsExpanded(false), []);
  const toggle = useCallback(() => setIsExpanded((prev) => !prev), []);

  return { isExpanded, expand, collapse, toggle };
}
