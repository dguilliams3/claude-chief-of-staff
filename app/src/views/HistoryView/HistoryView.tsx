/**
 * History browsing view -- lists past briefings and shows detail when one is selected.
 *
 * Two-state component: list mode (BriefingList) and detail mode (SectionCard array).
 * Fetches history on mount via store action. Selection triggers a full briefing fetch by ID.
 *
 * Used by: `app/src/App.tsx::AppShell` -- rendered when `view === 'history'`
 * See also: `app/src/components/TodayView.tsx` -- sibling view for current briefing
 * See also: `app/src/store/index.ts::fetchHistory` -- data fetching action
 * Do NOT: Cache selected briefings client-side -- always re-fetch to ensure freshness
 */
import { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useStore } from '@/store';
import { BriefingList } from '@/components/BriefingList';
import { SectionCard } from '@/components/SectionCard';

/**
 * Renders a browsable history of past briefings. Switches between list mode
 * and detail mode based on `selectedBriefingId` store state.
 * Calls `fetchHistory()` on mount to populate the list from the Worker API.
 *
 * Upstream: `app/src/App.tsx::AppShell` -- rendered when `view === 'history'`
 * Downstream: `app/src/components/BriefingList.tsx::BriefingList`,
 *   `app/src/components/SectionCard.tsx::SectionCard`
 * Downstream: `app/src/store/index.ts::fetchHistory`, `app/src/store/index.ts::selectBriefing`
 */
export function HistoryView() {
  const historyList = useStore((s) => s.historyList);
  const historyLoading = useStore((s) => s.historyLoading);
  const fetchHistory = useStore((s) => s.fetchHistory);
  const selectedBriefing = useStore((s) => s.selectedBriefing);
  const selectedBriefingId = useStore((s) => s.selectedBriefingId);
  const selectBriefing = useStore((s) => s.selectBriefing);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Loading state for selected briefing (ID set but data still fetching)
  if (selectedBriefingId && !selectedBriefing) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="font-mono text-sm text-muted">Loading briefing...</p>
      </div>
    );
  }

  // Detail view for a selected briefing
  if (selectedBriefingId && selectedBriefing) {
    return (
      <div className="flex flex-col min-h-[calc(100dvh-80px)]">
        <div className="px-5 pt-4 pb-2">
          <button
            onClick={() => selectBriefing({ id: null })}
            className="flex items-center gap-1.5 text-sm text-muted hover:text-primary transition-colors mb-3"
          >
            <ArrowLeft size={16} />
            <span>Back to list</span>
          </button>
          <h2 className="font-body font-semibold text-lg text-primary">
            {selectedBriefing.type} briefing
          </h2>
          <p className="font-mono text-xs text-muted mt-1">
            {new Date(selectedBriefing.generatedAt).toLocaleString()}
          </p>
        </div>
        <main className="flex-1 px-4 py-4 space-y-4 max-w-2xl mx-auto w-full">
          {selectedBriefing.sections.map((section, i) => (
            <SectionCard key={section.key} section={section} index={i} />
          ))}
        </main>
      </div>
    );
  }

  // Loading state
  if (historyLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="font-mono text-sm text-muted">Loading history...</p>
      </div>
    );
  }

  // List view
  return (
    <div className="px-4 py-4 max-w-2xl mx-auto w-full">
      <h2 className="font-body font-semibold text-lg text-primary mb-4 px-1">
        Past Briefings
      </h2>
      <BriefingList items={historyList} onSelect={(id) => selectBriefing({ id })} />
    </div>
  );
}
