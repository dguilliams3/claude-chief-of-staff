/**
 * Generic card container with surface background, rounded corners, and warm copper glow shadow.
 *
 * PRESENTATIONAL — pure layout wrapper, no state or side effects.
 *
 * Used by: `app/src/components/SectionCard.tsx::SectionCard`
 * See also: Tailwind theme tokens `bg-surface`, `rounded-card`, `border-border-subtle`
 */
import type { ReactNode } from 'react';

/**
 * Renders a styled card container with optional className extension.
 *
 * @param children - Content to render inside the card
 * @param className - Additional Tailwind classes to merge onto the outer div
 *
 * Upstream: `app/src/components/SectionCard.tsx::SectionCard`
 * Downstream: None — leaf presentational component
 * Pattern: className-merge — accepts className prop for parent-controlled layout
 */
export function Card({ children, className = '' }: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`
      relative bg-surface rounded-card
      border border-border-subtle
      shadow-[0_2px_10px_rgba(200,121,65,0.05),0_1px_3px_rgba(0,0,0,0.2)]
      ${className}
    `}>
      {children}
    </div>
  );
}
