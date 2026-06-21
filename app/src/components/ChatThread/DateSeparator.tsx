/**
 * Date separator between messages on different calendar days.
 *
 * Only shown in ConversationDetail (full-page mode), not in FollowUpBar drawer.
 * Controlled via showTimestamps prop on ChatThread.
 *
 * Used by: `app/src/components/ChatThread/ChatThread.tsx`
 */
interface DateSeparatorProps {
  date: string;
}

export function DateSeparator({ date }: DateSeparatorProps) {
  const formatted = new Date(date).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="flex items-center gap-2 py-2">
      <div className="flex-1 border-t border-border-subtle" />
      <span className="text-[10px] font-medium text-muted uppercase tracking-wider">{formatted}</span>
      <div className="flex-1 border-t border-border-subtle" />
    </div>
  );
}
