import { useState, useEffect } from 'react';
import { useStore } from '@/store';

const TIMEOUT_MS = 10 * 60 * 1000;

export function RunningBanner() {
  const activeTrigger = useStore((s) => s.activeTrigger);
  const triggerBriefing = useStore((s) => s.triggerBriefing);
  const cancelTrigger = useStore((s) => s.cancelTrigger);

  const [dots, setDots] = useState('');
  const [elapsed, setElapsed] = useState(0);

  const triggerStart = activeTrigger?.triggerStart ?? null;
  const triggerType = activeTrigger?.type ?? '';

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((d) => (d.length >= 3 ? '' : d + '.'));
      if (triggerStart) setElapsed(Date.now() - triggerStart);
    }, 800);
    return () => clearInterval(interval);
  }, [triggerStart]);

  const timedOut = elapsed > TIMEOUT_MS;

  return (
    <div className={`mx-4 mt-3 px-4 py-3 rounded-[var(--radius-card)] border ${
      timedOut
        ? 'bg-severity-flag/10 border-severity-flag/20'
        : 'bg-accent/10 border-accent/20'
    }`}>
      <p
        className={`font-mono text-sm ${timedOut ? 'text-severity-flag' : 'text-secondary'}`}
      >
        {timedOut
          ? `${triggerType} briefing may have failed or is still running.`
          : `Generating ${triggerType} briefing${dots}`
        }
      </p>
      <p className="font-body text-muted text-xs mt-1">
        {timedOut
          ? 'It has been over 10 minutes. You can retry or dismiss.'
          : 'This takes 2-5 minutes. Feel free to come back.'
        }
      </p>
      {timedOut && (
        <div className="flex gap-3 mt-2">
          <button
            onClick={() => { cancelTrigger(); void triggerBriefing(); }}
            className="font-mono text-xs px-3 py-1 rounded bg-accent/20 text-accent hover:bg-accent/30"
          >
            Retry
          </button>
          <button
            onClick={cancelTrigger}
            className="font-mono text-xs px-3 py-1 rounded bg-surface-raised text-muted hover:text-foreground"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
