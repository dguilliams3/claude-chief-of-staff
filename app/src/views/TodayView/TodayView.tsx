import type { BriefingSection } from '@/domain/briefing';
import { useStore } from '@/store';
import { SectionCard } from '@/components/SectionCard';
import { FollowUpBar } from '@/components/FollowUpBar';
import { RunningBanner } from '@/components/RunningBanner';

export function TodayView() {
  const activeType = useStore((s) => s.activeType);
  const briefing = useStore((s) => s.briefings[s.activeType]);
  const activeTrigger = useStore((s) => s.activeTrigger);
  const triggerBriefing = useStore((s) => s.triggerBriefing);
  const showBanner = activeTrigger?.type === activeType;

  // Empty state — no briefing for this type
  if (!briefing) {
    return (
      <div className="flex flex-col min-h-[calc(100dvh-80px)]">
        {showBanner && <RunningBanner />}
        {!showBanner && (
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
            <p className="font-body text-muted text-sm mb-4">
              No {activeType} briefing yet.
            </p>
            <button
              onClick={triggerBriefing}
              disabled={!!activeTrigger}
              className="
                px-5 py-2 rounded-card
                bg-accent text-surface
                text-sm font-medium font-mono
                disabled:opacity-40
                hover:brightness-110
                transition-all duration-200
              "
            >
              Generate now
            </button>
          </div>
        )}
      </div>
    );
  }

  const allInfo = briefing.sections.every(s => s.severity === 'info');

  const isDefaultOpen = (section: BriefingSection, index: number) => {
    if (section.severity === 'flag' || section.severity === 'warn') return true;
    if (allInfo && index < 2) return true;
    if (index === 0) return true;
    return false;
  };

  return (
    <div className="flex flex-col min-h-[calc(100dvh-80px)]">
      {showBanner && <RunningBanner />}

      <main className="flex-1 px-4 py-4 space-y-4 max-w-2xl mx-auto w-full">
        {briefing.sections.map((section, i) => (
          <SectionCard
            key={section.key}
            section={section}
            index={i}
            defaultOpen={isDefaultOpen(section, i)}
          />
        ))}
      </main>
      <FollowUpBar briefingId={briefing.id} sessionId={briefing.sessionId} />
    </div>
  );
}
