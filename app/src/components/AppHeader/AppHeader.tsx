import { RefreshCw, ChevronDown, Download } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useStore } from '@/store';
import { useRelativeTime } from '@/hooks/useRelativeTime';
import { SessionDropdown } from './SessionDropdown';
import { generateAndDownloadPdf } from '@/lib/export';

const TYPE_LABELS: Record<string, string> = {
  work: 'Work',
  news: 'News',
};

/**
 * Formats a raw token count into compact K/M notation.
 *
 * @param n - Token count (e.g., 29000)
 * @returns Compact string (e.g., '29K', '1M', '156K')
 *
 * Used by: AppHeader meta row token indicator
 */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

declare const __COMMIT_HASH__: string;

export function AppHeader() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const activeType = useStore((s) => s.activeType);
  const availableTypes = useStore((s) => s.availableTypes);
  const setActiveType = useStore((s) => s.setActiveType);
  const triggerBriefing = useStore((s) => s.triggerBriefing);
  const activeTrigger = useStore((s) => s.activeTrigger);
  const sessionMode = useStore((s) => s.sessionMode);
  const logout = useStore((s) => s.logout);
  const currentBriefing = useStore((s) => s.briefings[s.activeType]);
  const ago = useRelativeTime(currentBriefing?.generatedAt ?? '');
  const isTriggering = !!activeTrigger;
  const spinOnThisTab = activeTrigger?.type === activeType;

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [dropdownOpen]);

  return (
    <header className="
      sticky top-0 z-20
      bg-background/80 backdrop-blur-xl
      border-b border-border-subtle
      px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-3
    ">
      {/* Row 1: Title + logout */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setView({ view: 'today' })}
          className="font-display text-[20px] text-primary italic tracking-tight"
        >
          Chief of Staff
        </button>
        <div className="flex items-center gap-3">
          {typeof __COMMIT_HASH__ !== 'undefined' && (
            <span className="font-mono text-[0.5rem] text-muted/30">{__COMMIT_HASH__}</span>
          )}
          <button
            onClick={logout}
            className="font-mono text-[0.6rem] text-muted/40 hover:text-muted transition-colors min-h-12 min-w-12 flex items-center justify-center"
          >
            logout
          </button>
        </div>
      </div>

      {/* Row 2: Type tabs + Generate */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-4">
          {availableTypes.map((t) => (
            <button
              key={t}
              onClick={() => setActiveType({ type: t })}
              className={`
                relative font-mono text-[11px] uppercase tracking-wider pb-1
                transition-colors duration-200
                ${t === activeType
                  ? 'text-accent'
                  : 'text-muted hover:text-primary'
                }
              `}
            >
              {TYPE_LABELS[t] ?? t}
              {t === activeType && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent rounded-full" />
              )}
            </button>
          ))}
        </div>
        {/* Split Generate button: left = generate action, right = session dropdown toggle */}
        <div ref={dropdownRef} className="relative flex items-stretch">
          {/* Main generate button */}
          <button
            onClick={() => { void triggerBriefing(); }}
            disabled={isTriggering}
            className="
              flex items-center gap-1.5
              pl-3 pr-2 py-1.5
              rounded-l-card
              bg-accent text-surface
              text-[10px] font-medium
              font-mono uppercase tracking-wider
              disabled:opacity-40
              hover:brightness-110
              transition-all duration-200
            "
          >
            <RefreshCw size={12} className={spinOnThisTab ? 'animate-spin' : ''} />
            <span>
              {isTriggering
                ? 'Running...'
                : sessionMode.type === 'resume'
                  ? 'Resume'
                  : 'Generate'
              }
            </span>
          </button>
          {/* Divider */}
          <div className="w-px bg-surface/30 self-stretch" />
          {/* Dropdown arrow toggle */}
          <button
            onClick={() => setDropdownOpen((o) => !o)}
            disabled={isTriggering}
            aria-label="Session options"
            className="
              flex items-center justify-center
              px-1.5 py-1.5
              rounded-r-card
              bg-accent text-surface
              disabled:opacity-40
              hover:brightness-110
              transition-all duration-200
            "
          >
            <ChevronDown
              size={12}
              className={`transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {/* Session dropdown */}
          {dropdownOpen && (
            <SessionDropdown onClose={() => setDropdownOpen(false)} />
          )}
        </div>
      </div>

      {/* Row 3: Temporal tabs + meta */}
      <div className="flex items-center gap-4">
        {(['today', 'history', 'chats'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView({ view: v })}
            className={`
              relative font-mono text-[10px] uppercase tracking-wider pb-0.5
              transition-colors duration-200
              ${v === view
                ? 'text-accent-dim'
                : 'text-muted hover:text-primary'
              }
            `}
          >
            {v === 'today' ? 'Current' : v === 'history' ? 'History' : 'Chats'}
            {v === view && (
              <span className="absolute bottom-0 left-0 right-0 h-px bg-accent-dim rounded-full" />
            )}
          </button>
        ))}
        {currentBriefing && (
          <span className="font-mono text-[10px] text-muted ml-auto flex items-center">
            #{currentBriefing.metadata.briefingNumber}
            <span className="mx-1.5 text-border">·</span>
            {ago}
            <span className="mx-1.5 text-border">·</span>
            {currentBriefing.tokenUsage
              ? (
                <>
                  <span className="text-accent">{formatTokens(currentBriefing.tokenUsage.totalTokens)}</span>
                  <span className="text-muted">/{formatTokens(currentBriefing.tokenUsage.contextWindow)}</span>
                </>
              )
              : <span className="text-muted">—</span>
            }
            <button
              onClick={() => void generateAndDownloadPdf(currentBriefing)}
              aria-label="Download PDF"
              className="ml-2 text-muted/50 hover:text-accent transition-colors"
            >
              <Download size={12} />
            </button>
          </span>
        )}
      </div>
    </header>
  );
}
