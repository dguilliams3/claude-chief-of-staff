/**
 * Shared scrollable message thread -- renders messages with optional
 * timestamps, date separators, and typing indicator.
 *
 * Used in two contexts:
 * 1. FollowUpBar (drawer mode) -- constrained height, timestamps on hydrated only
 * 2. ConversationDetail (full-page mode) -- full height, with timestamps
 *
 * Used by: `app/src/components/FollowUpBar/FollowUpBar.tsx`
 * Used by: `app/src/views/ChatsView/ConversationDetail.tsx`
 * See also: `app/src/domain/conversation/types.ts::Message` -- message data shape
 * Do NOT: Import the store directly -- receive data via props
 * Do NOT: Handle send/submit -- that's ChatInput's responsibility
 */
import { useEffect, useRef } from 'react';
import type { Message } from '@/domain/conversation';
import { isAwaitingResponse, awaitingSince } from '@/domain/conversation';
import { ChatBubble } from './ChatBubble';
import { MessageTimestamp } from './MessageTimestamp';
import { DateSeparator } from './DateSeparator';
import { TypingIndicator } from './TypingIndicator';

interface ChatThreadProps {
  messages: Message[];
  showTimestamps?: boolean;
  isLoading?: boolean;
  /** When the pending follow-up was sent (Date.now()). Drives the elapsed counter in TypingIndicator. */
  loadingStartedAt?: number;
  className?: string;
}

/**
 * Scrollable message thread with auto-scroll, date separators, and status indicators.
 *
 * Supports two status modes:
 * - **Active polling** (isLoading=true): bouncing dots + elapsed counter from loadingStartedAt
 * - **Passive awaiting** (last message is user): same indicator using the message's createdAt
 *
 * @param messages - Chronologically ordered Message array from D1 or Zustand
 * @param showTimestamps - Show per-message timestamps and date separators
 * @param isLoading - Active polling in progress (same device that sent the message)
 * @param loadingStartedAt - Date.now() when follow-up was sent, drives TypingIndicator counter
 * @param className - Additional CSS classes for the container
 *
 * Upstream: `app/src/components/FollowUpBar/FollowUpBar.tsx`
 * Upstream: `app/src/views/ChatsView/ConversationDetail.tsx`
 * Downstream: `ChatBubble`, `MessageTimestamp`, `DateSeparator`, `TypingIndicator`
 * Do NOT: Import the store directly — receive data via props
 */
export function ChatThread({ messages, showTimestamps = false, isLoading = false, loadingStartedAt, className = '' }: ChatThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const awaiting = !isLoading && isAwaitingResponse(messages);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isLoading]);

  let lastDate = '';

  return (
    <div className={`flex flex-col gap-2 overflow-y-auto ${className}`}>
      {messages.map((msg) => {
        const msgDate = new Date(msg.createdAt).toDateString();
        const showSeparator = showTimestamps && msgDate !== lastDate;
        lastDate = msgDate;

        return (
          <div key={msg.id}>
            {showSeparator && <DateSeparator date={msg.createdAt} />}
            <ChatBubble role={msg.role} content={msg.content} />
            {showTimestamps && <MessageTimestamp createdAt={msg.createdAt} />}
          </div>
        );
      })}
      {/* Active polling indicator — same device that sent the message */}
      {isLoading && <TypingIndicator startedAt={loadingStartedAt} />}
      {/* Passive awaiting indicator — data-derived, works on any device after
          refresh. Shows same TypingIndicator using the user message timestamp. */}
      {awaiting && <TypingIndicator startedAt={awaitingSince(messages)} />}
      <div ref={bottomRef} />
    </div>
  );
}
