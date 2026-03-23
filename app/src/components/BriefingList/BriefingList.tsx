/**
 * Briefing list component -- renders a clickable list of past briefing summaries.
 *
 * PRESENTATIONAL component. Receives briefing list items and a selection callback.
 * Each row shows the briefing type, timestamp, section count, and max severity dot.
 *
 * Used by: `app/src/components/HistoryView.tsx::HistoryView` -- list mode
 * See also: `app/src/domain/briefing/types.ts::BriefingListItem` -- shape of each item
 */
import { Clock } from 'lucide-react';
import type { BriefingListItem } from '@/domain/briefing';
import { SeverityDot } from '@/ui/SeverityDot';

/**
 * Renders a vertical list of briefing summary cards with severity dots,
 * type labels, timestamps, and section counts. Shows an empty-state message
 * when no items exist.
 *
 * @param items - Array of briefing list items from the history endpoint
 * @param onSelect - Callback invoked with the briefing ID when a row is tapped
 *
 * Upstream: `app/src/components/HistoryView.tsx::HistoryView`
 * Downstream: `app/src/components/SeverityDot.tsx::SeverityDot`
 * Coupling: `app/src/domain/briefing/types.ts::BriefingListItem` -- must match Worker API shape
 */
export function BriefingList({ items, onSelect }: {
  items: BriefingListItem[];
  onSelect: (id: string) => void;
}) {
  if (items.length === 0) {
    return (
      <p className="text-muted text-sm text-center py-12">
        No past briefings found.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onSelect(item.id)}
          className="
            w-full text-left px-4 py-3 rounded-card
            bg-surface border border-border-subtle
            hover:border-border hover:bg-surface-raised
            transition-all duration-200
            flex items-center gap-3
          "
        >
          <SeverityDot severity={item.maxSeverity} />
          <div className="flex-1 min-w-0">
            <p className="font-body font-semibold text-sm text-primary truncate">
              {item.type} briefing
            </p>
            <p className="font-mono text-xs text-muted flex items-center gap-1.5 mt-0.5">
              <Clock size={12} />
              {new Date(item.generatedAt).toLocaleDateString(undefined, {
                month: 'short', day: 'numeric', year: 'numeric',
                hour: 'numeric', minute: '2-digit',
              })}
              <span className="text-border">·</span>
              {item.sectionCount} sections
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}
