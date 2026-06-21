/**
 * Conversation awaiting-response helpers — check whether a conversation
 * is waiting for an assistant reply and when the wait began.
 *
 * Derived purely from D1 message data — no client-side state needed.
 * Works on any device, after refresh, across sessions.
 *
 * Even though these are one-liners, they are extracted as named functions
 * to teach the convention: status checks on conversation data belong here,
 * not inline in components. Future agents seeing `isAwaitingResponse(messages)`
 * will follow the pattern rather than scattering inline checks.
 *
 * Upstream: `app/src/components/ChatThread/ChatThread.tsx`
 * See also: `app/src/domain/conversation/types.ts::Message` — input type
 */

import type { Message } from '@/domain/conversation/types';

/**
 * Checks whether the conversation is awaiting an assistant response.
 *
 * @param messages - Chronologically ordered message array from D1
 * @returns true if the last message is from the user (no assistant reply yet)
 *
 * Upstream: `ChatThread` (passive TypingIndicator), reusable by chat list
 */
/** Max age (ms) before a pending user message is considered a lost response. */
const MAX_AWAITING_AGE_MS = 10 * 60 * 1000; // 10 minutes

export function isAwaitingResponse(messages: Message[]): boolean {
  if (messages.length === 0) return false;
  const lastMsg = messages[messages.length - 1];
  if (lastMsg.role !== 'user') return false;
  // Don't show typing indicator for old messages — the response was likely lost
  const ageMs = Date.now() - new Date(lastMsg.createdAt).getTime();
  return ageMs < MAX_AWAITING_AGE_MS;
}

/**
 * Returns the timestamp (ms since epoch) when the awaiting state began.
 * Uses the last user message's createdAt — the moment the question was sent.
 *
 * @param messages - Chronologically ordered message array from D1
 * @returns Date.now()-compatible timestamp, or undefined if not awaiting
 *
 * Upstream: `ChatThread` — drives TypingIndicator elapsed counter
 */
export function awaitingSince(messages: Message[]): number | undefined {
  if (!isAwaitingResponse(messages)) return undefined;
  return new Date(messages[messages.length - 1].createdAt).getTime();
}
