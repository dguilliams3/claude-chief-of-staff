/**
 * Merges D1-hydrated messages with local in-memory messages, deduplicating by ID.
 *
 * D1 messages take precedence. Output sorted by createdAt for correct ordering
 * even when D1 was down during a middle exchange.
 *
 * @param d1 - Messages fetched from D1 (authoritative source)
 * @param local - Messages held in local Zustand state (may include optimistic entries)
 * @returns Deduplicated, chronologically sorted message array
 *
 * Upstream: `app/src/store/conversationSlice.ts::hydrateFollowUpHistory`
 * Coupling: Called during hydration to reconcile server and client state
 * Tested by: `app/src/store/conversationSlice.test.ts`
 * Do NOT: Use content-based dedup — ID-based is required (prevents masking UUID bugs)
 */

import type { Message } from '@/domain/conversation/types';

export function mergeMessages(d1: Message[], local: Message[]): Message[] {
  const d1Ids = new Set(d1.map(m => m.id));
  const localOnly = local.filter(m => !d1Ids.has(m.id));
  return [...d1, ...localOnly].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}
