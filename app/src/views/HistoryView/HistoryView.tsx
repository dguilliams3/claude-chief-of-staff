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
import { ArrowLeft, Download } from 'lucide-react';
import { useStore } from '@/store';
import { BriefingList } from '@/components/BriefingList';
import { SectionCard } from '@/components/SectionCard';
import { Skeleton } from '@/components/Skeleton';
import { SurfaceState } from '@/components/SurfaceState';
import { generateAndDownloadPdf } from '@/lib/export';

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
  const historyError = useStore((s) => s.historyError);
  const fetchHistory = useStore((s) => s.fetchHistory);
  const selectedBriefing = useStore((s) => s.selectedBriefing);
  const selectedBriefingId = useStore((s) => s.selectedBriefingId);
  const selectedBriefingError = useStore((s) => s.selectedBriefingError);
  const selectBriefing = useStore((s) => s.selectBriefing);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  if (selectedBriefingId && !selectedBriefing && selectedBriefingError) {
    return (
      <div className="flex flex-col min-h-[calc(100dvh-80px)]">
        <div className="px-5 pt-4 pb-2">
          <button
            type="button"
            onClick={() => void selectBriefing({ id: null })}
            className="-ml-1 inline-flex items-center gap-1.5 min-h-10 px-1 text-sm text-muted hover:text-primary transition-colors"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            <span>Back to list</span>
          </button>
        </div>
        <SurfaceState
          title="Couldn't open that briefing"
          message={selectedBriefingError}
          tone="error"
        >
          <button
            type="button"
            onClick={() => void selectBriefing({ id: selectedBriefingId })}
            className="inline-flex min-h-10 items-center rounded-card bg-accent px-4 py-2 text-sm font-medium text-surface transition-all duration-200 hover:brightness-110"
          >
            Retry
          </button>
        </SurfaceState>
      </div>
    );
  }

  // Loading state for selected briefing (ID set but data still fetching).
  // Skeleton mirrors the detail layout: header (back link, title, timestamp,
  // PDF button) + SectionCard placeholders.
  if (selectedBriefingId && !selectedBriefing) {
    return (
      <div
        className="flex flex-col min-h-[calc(100dvh-80px)]"
        role="status"
        aria-label="Loading briefing"
      >
        <div className="px-5 pt-4 pb-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
              <Skeleton width={96} height={14} decorative />
              <Skeleton width="55%" height={22} decorative />
              <Skeleton width="40%" height={12} decorative />
            </div>
            <Skeleton width={64} height={28} decorative />
          </div>
        </div>
        <main className="flex-1 px-4 py-4 space-y-4 max-w-2xl mx-auto w-full">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="bg-surface rounded-card border border-border-subtle px-5 py-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Skeleton width={10} height={10} rounded="full" decorative />
                  <Skeleton width={120} height={15} decorative />
                </div>
                <Skeleton width={48} height={14} rounded="full" decorative />
              </div>
              <Skeleton width="100%" height={12} decorative />
              <Skeleton width="88%" height={12} decorative />
            </div>
          ))}
        </main>
      </div>
    );
  }

  // Detail view for a selected briefing
  if (selectedBriefingId && selectedBriefing) {
    return (
      <div className="flex flex-col min-h-[calc(100dvh-80px)]">
        <div className="px-5 pt-4 pb-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <button
                type="button"
                onClick={() => selectBriefing({ id: null })}
                className="-ml-1 inline-flex items-center gap-1.5 min-h-10 px-1 text-sm text-muted hover:text-primary transition-colors mb-2"
              >
                <ArrowLeft size={16} aria-hidden="true" />
                <span>Back to list</span>
              </button>
              <h2 className="font-body font-semibold text-lg text-primary">
                {selectedBriefing.type} briefing
              </h2>
              <p className="font-mono text-xs text-muted mt-1">
                {new Date(selectedBriefing.generatedAt).toLocaleString()}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void generateAndDownloadPdf(selectedBriefing)}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-card border border-border-subtle px-3 py-2 min-h-10 text-xs font-mono uppercase tracking-wider text-muted transition-colors hover:text-accent"
              aria-label="Download this briefing as a PDF"
            >
              <Download size={13} aria-hidden="true" />
              <span>PDF</span>
            </button>
          </div>
        </div>
        <main className="flex-1 px-4 py-4 space-y-4 max-w-2xl mx-auto w-full">
          {selectedBriefing.sections.map((section, i) => (
            <SectionCard key={section.key} section={section} index={i} />
          ))}
        </main>
      </div>
    );
  }

  // Loading state — skeleton rows mirror BriefingList's row shape so the user
  // sees the eventual layout, not a centered spinner.
  if (historyLoading) {
    return (
      <div
        className="px-4 py-4 max-w-2xl mx-auto w-full"
        role="status"
        aria-label="Loading history"
      >
        <Skeleton width="45%" height={22} className="mb-4 ml-1" decorative />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="bg-surface rounded-card border border-border-subtle px-4 py-3 flex items-center gap-3"
            >
              <Skeleton width={10} height={10} rounded="full" decorative />
              <div className="flex-1 min-w-0 space-y-1.5">
                <Skeleton width="55%" height={14} decorative />
                <Skeleton width="80%" height={12} decorative />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (historyError && historyList.length === 0) {
    return (
      <SurfaceState
        title="Couldn't load briefing history"
        message={historyError}
        tone="error"
      >
        <button
          type="button"
          onClick={() => void fetchHistory()}
          className="inline-flex min-h-10 items-center rounded-card bg-accent px-4 py-2 text-sm font-medium text-surface transition-all duration-200 hover:brightness-110"
        >
          Retry
        </button>
      </SurfaceState>
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
