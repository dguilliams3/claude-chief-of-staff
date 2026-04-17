/**
 * Typing indicator -- bouncing dots + elapsed timer shown while waiting for a response.
 *
 * PRESENTATIONAL. Rendered inside a left-aligned bubble to match assistant styling.
 * Shows elapsed time as a per-second counter. After 15s, shows a "feel free to leave"
 * message since Claude may be doing agentic work.
 *
 * The counter is purely cosmetic (1s setInterval), decoupled from the actual poll
 * schedule which runs on an adaptive timer in the store.
 *
 * Used by: `app/src/components/ChatThread/ChatThread.tsx`
 * See also: `app/src/store/conversationSlice.ts` -- sets pendingFollowUps[historyKey].startedAt
 */
import { useState, useEffect } from 'react';

/** Threshold (ms) after which we show the "feel free to leave" message. */
const LONG_WAIT_THRESHOLD_MS = 15_000;

interface TypingIndicatorProps {
  /** Timestamp (Date.now()) when the follow-up was sent. Drives the elapsed counter. */
  startedAt?: number;
}

export function TypingIndicator({ startedAt }: TypingIndicatorProps) {
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    if (!startedAt) return;

    // Initialize with current elapsed (handles remount after navigation)
    setElapsedSec(Math.floor((Date.now() - startedAt) / 1000));

    const id = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    return () => clearInterval(id);
  }, [startedAt]);

  const showTimer = startedAt && elapsedSec > 0;
  const isLongWait = startedAt && elapsedSec * 1000 >= LONG_WAIT_THRESHOLD_MS;

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex justify-start">
        <div className="px-4 py-2.5 rounded-2xl rounded-bl-sm bg-surface-raised border border-border-subtle">
          <div className="flex items-center gap-2">
            {/* Bouncing dots */}
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-muted/50 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-muted/50 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-muted/50 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            {/* Elapsed counter */}
            {showTimer && (
              <span className="text-xs text-muted ml-1">
                {elapsedSec}s
              </span>
            )}
          </div>
        </div>
      </div>
      {/* Long-wait message — shown after 15s */}
      {isLongWait && (
        <p className="text-xs text-muted px-2">
          Feel free to leave — Claude is working and the response will appear when ready.
        </p>
      )}
    </div>
  );
}
