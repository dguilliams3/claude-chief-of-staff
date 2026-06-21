/**
 * Drawer handle -- visual grab bar that toggles the follow-up drawer open/closed.
 *
 * PRESENTATIONAL. Renders a short horizontal bar centered at the top of the
 * FollowUpBar. Tap target is the full-width row for easy mobile interaction.
 *
 * Used by: `app/src/components/FollowUpBar/FollowUpBar.tsx`
 */
export function DrawerHandle({ isExpanded, onToggle }: {
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      aria-label={isExpanded ? 'Collapse follow-up' : 'Expand follow-up'}
      className="w-full flex justify-center py-2 cursor-pointer group"
    >
      <div className={`
        w-10 h-1 rounded-full
        bg-muted/30 group-hover:bg-muted/50
        transition-all duration-200
        ${isExpanded ? 'w-12 bg-muted/40' : ''}
      `} />
    </button>
  );
}
