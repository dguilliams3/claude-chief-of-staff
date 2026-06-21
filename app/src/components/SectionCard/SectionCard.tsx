/**
 * SectionCard -- collapsible briefing section with severity-colored left border and badge.
 *
 * PRESENTATIONAL component that renders a single section of a briefing.
 * Uses CSS `grid-template-rows` collapse (via `section-collapse` class and `data-open`
 * attribute) for smooth expand/collapse animation. Each card fades in with a stagger
 * delay driven by its `index` prop.
 *
 * Used by: `app/src/components/TodayView.tsx::TodayView`, `app/src/components/HistoryView.tsx::HistoryView`
 * See also: `app/src/domain/briefing/types.ts::BriefingSection` -- data shape rendered here
 * Do NOT: Use conditional rendering (`{open && ...}`) for the collapsible body -- breaks the CSS grid collapse animation
 * Do NOT: Remove `aria-expanded` or `aria-label` from the toggle button -- required for screen reader accessibility
 */
import { useState } from 'react';
import { ChevronDown, MessageCircle } from 'lucide-react';
import { useStore } from '@/store';
import type { BriefingSection } from '@/domain/briefing';
import { Card } from '@/ui/Card';
import { SeverityDot } from '@/ui/SeverityDot';
import { SeverityBadge } from '@/ui/SeverityBadge';
import { Markdown } from '@/ui/Markdown';

const severityBorder: Record<string, string> = {
  info: '',
  warn: 'border-l-4 border-l-severity-warn',
  flag: 'border-l-4 border-l-severity-flag',
};

/**
 * Renders a collapsible briefing section with severity indicators and stagger animation.
 *
 * @param section - Briefing section data containing key, label, content, and severity
 * @param defaultOpen - Whether the section starts expanded (default: true)
 * @param index - Position in the section list, controls stagger animation delay (60ms per index)
 *
 * Upstream: `app/src/components/TodayView.tsx::TodayView`, `app/src/components/HistoryView.tsx::HistoryView`
 * Downstream: `app/src/ui/Markdown.tsx::Markdown`, `app/src/ui/SeverityDot.tsx::SeverityDot`, `app/src/ui/SeverityBadge.tsx::SeverityBadge`, `app/src/ui/Card.tsx::Card`
 * Downstream: `app/src/store/conversationSlice.ts::setPrefillQuestion` — "Ask about this" button writes section label as prefill
 * Pattern: grid-collapse -- `section-collapse` CSS class with `data-open` attribute
 * Do NOT: Replace CSS grid collapse with conditional rendering -- animation will break
 */
export function SectionCard({ section, defaultOpen = true, index = 0 }: {
  section: BriefingSection;
  defaultOpen?: boolean;
  index?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const setPrefillQuestion = useStore((s) => s.setPrefillQuestion);

  return (
    <div
      className="animate-card-enter"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <Card className={severityBorder[section.severity]}>
        <button
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={`Toggle ${section.label}`}
          className="w-full flex items-center justify-between px-5 py-4 text-left group"
        >
          <span className="flex items-center gap-3">
            <SeverityDot severity={section.severity} />
            <span
              className="font-display italic text-[15px] font-normal text-primary tracking-tight"
            >
              {section.label}
            </span>
          </span>
          <span className="flex items-center gap-3">
            <SeverityBadge severity={section.severity} />
            <ChevronDown size={16} className={`text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
          </span>
        </button>

        <div className="section-collapse" data-open={open}>
          <div className="px-5 pb-5 pt-0">
            <div className="border-t border-border-subtle pt-4">
              <Markdown content={section.content} />
              <button
                onClick={() => {
                  setPrefillQuestion(`Tell me more about the "${section.label}" section.`);
                  // Scroll to bottom where FollowUpBar lives
                  // Focus the FollowUpBar input — scrollIntoView works with sticky positioning
                  const followUpInput = document.querySelector<HTMLInputElement>('[data-followup-input]');
                  followUpInput?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  followUpInput?.focus();
                }}
                className="
                  mt-3 flex items-center gap-1.5
                  text-[11px] font-mono text-muted/60
                  hover:text-accent transition-colors
                "
              >
                <MessageCircle size={12} />
                Ask about this
              </button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
