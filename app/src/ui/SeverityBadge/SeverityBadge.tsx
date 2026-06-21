/**
 * Severity label badge — renders the severity name as a colored, pill-shaped tag.
 *
 * PRESENTATIONAL — displays severity as uppercase text with tinted background and border.
 *
 * Used by: `app/src/components/SectionCard.tsx::SectionCard`
 * See also: `app/src/ui/SeverityDot/SeverityDot.tsx::SeverityDot` — companion dot indicator
 * See also: `app/src/domain/briefing/types.ts::Severity` — info | warn | flag
 */
import type { Severity } from '@/domain/briefing';

/** Tailwind class map: tinted background, text color, and border per severity level. */
const styles: Record<Severity, string> = {
  info: 'bg-severity-info/10 text-severity-info border-severity-info/20',
  warn: 'bg-severity-warn/10 text-severity-warn border-severity-warn/20',
  flag: 'bg-severity-flag/10 text-severity-flag border-severity-flag/25',
};

/**
 * Renders a pill-shaped badge displaying the severity level name in matching color.
 * Uses monospace font, uppercase tracking, and a tinted background/border.
 *
 * @param severity - One of "info", "warn", or "flag"
 *
 * Upstream: `app/src/components/SectionCard.tsx::SectionCard`
 * Downstream: None — leaf presentational component
 * Coupling: `app/src/domain/briefing/types.ts::Severity` — must stay in sync with severity union
 */
export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={`
      px-2 py-0.5 rounded-pill text-xs
      font-mono font-medium uppercase tracking-wider
      border ${styles[severity]}
    `}>
      {severity}
    </span>
  );
}
