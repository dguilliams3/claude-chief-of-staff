/**
 * Custom React hook for displaying human-readable relative timestamps.
 *
 * Converts ISO 8601 strings into "just now", "5m ago", "3h ago", "2d ago" format
 * and auto-updates every 60 seconds while the component is mounted.
 *
 * Used by: Briefing display components that show `generatedAt` timestamps
 * See also: `app/src/types/briefing.ts::Briefing` -- `generatedAt` field
 * Pattern: STORE-FIRST -- reads timestamp from store, manages only display state locally
 */
import { useState, useEffect } from 'react';

/**
 * Converts an ISO 8601 timestamp into a compact relative time string.
 *
 * @param iso - ISO 8601 date string (e.g., "2026-03-06T14:30:00Z")
 * @returns Human-readable relative time (e.g., "just now", "5m ago", "3h ago", "2d ago")
 */
function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);

  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * React hook that returns a live-updating relative time string for the given ISO timestamp.
 * Re-evaluates every 60 seconds via `setInterval`, cleaning up on unmount or input change.
 *
 * @param iso - ISO 8601 date string to display relative to now
 * @returns Reactive relative time string (e.g., "5m ago")
 *
 * Upstream: Any component displaying briefing timestamps
 * Downstream: `useRelativeTime.ts::formatRelative` -- pure formatting logic
 * Pattern: timer-hook -- interval-based state update with cleanup on unmount
 */
export function useRelativeTime(iso: string): string {
  const [text, setText] = useState(() => formatRelative(iso));

  useEffect(() => {
    setText(formatRelative(iso));
    const id = setInterval(() => setText(formatRelative(iso)), 60_000);
    return () => clearInterval(id);
  }, [iso]);

  return text;
}
