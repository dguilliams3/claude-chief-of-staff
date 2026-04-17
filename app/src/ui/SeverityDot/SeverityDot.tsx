/**
 * Glowing circular severity indicator dot with color and animation by severity level.
 *
 * PRESENTATIONAL — renders a layered dot (blur background + solid foreground)
 * that glows and pulses for "flag" severity.
 *
 * Used by: `app/src/components/SectionCard.tsx::SectionCard`,
 *          `app/src/components/BriefingList.tsx::BriefingList`
 * See also: `app/src/domain/briefing/types.ts::Severity` — info | warn | flag
 */
import type { Severity } from '@/domain/briefing';

/** Tailwind class map: background color + box-shadow glow per severity level. */
const dotStyles: Record<Severity, string> = {
  info: 'bg-severity-info shadow-[0_0_6px_var(--color-glow-info)]',
  warn: 'bg-severity-warn shadow-[0_0_8px_var(--color-glow-warn)]',
  flag: 'bg-severity-flag shadow-[0_0_10px_var(--color-glow-flag)] animate-glow-pulse',
};

/**
 * Renders a 2.5-unit glowing dot colored by severity level.
 * Uses a blurred background span for the glow halo and a solid foreground span for the dot.
 * The "flag" severity adds an `animate-glow-pulse` animation.
 *
 * @param severity - One of "info", "warn", or "flag"
 *
 * Upstream: `app/src/components/SectionCard.tsx::SectionCard`,
 *           `app/src/components/BriefingList.tsx::BriefingList`
 * Downstream: None — leaf presentational component
 * Coupling: `app/src/domain/briefing/types.ts::Severity` — must stay in sync with severity union
 */
export function SeverityDot({ severity }: { severity: Severity }) {
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span className={`
        absolute inset-0 rounded-full opacity-40 blur-[3px]
        ${severity === 'flag' ? 'bg-severity-flag' : severity === 'warn' ? 'bg-severity-warn' : 'bg-severity-info'}
      `} />
      <span className={`relative rounded-full h-2.5 w-2.5 ${dotStyles[severity]}`} />
    </span>
  );
}
