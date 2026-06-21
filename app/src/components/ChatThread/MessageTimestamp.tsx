/**
 * Inline timestamp display for individual messages.
 *
 * Shows time-only for today's messages, date+time for older messages.
 * Uses ISO 8601 string input (server-generated, normalized by Worker).
 *
 * Used by: `app/src/components/ChatThread/ChatThread.tsx`
 * Do NOT: Parse or format timestamps differently -- consistency with ConversationList
 */
interface MessageTimestampProps {
  createdAt: string;
}

export function MessageTimestamp({ createdAt }: MessageTimestampProps) {
  const date = new Date(createdAt);
  const isToday = date.toDateString() === new Date().toDateString();
  const formatted = isToday
    ? date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  return <p className="font-mono text-[9px] text-muted mt-0.5 px-1">{formatted}</p>;
}
