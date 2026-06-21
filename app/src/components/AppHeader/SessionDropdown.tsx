/**
 * Session dropdown for the split Generate button in AppHeader.
 *
 * Shows "✦ New Session" pinned at top, followed by recent sessions sorted by
 * lastUsedAt DESC. Each row displays token count + relative time. Selecting a
 * session sets `sessionMode` in the briefing store so `triggerBriefing` can
 * pass the correct sessionId to the API.
 *
 * Used by: `app/src/components/AppHeader/AppHeader.tsx`
 * See also: `app/src/domain/session/api.ts` — fetchSessions()
 * See also: `app/src/domain/session/types.ts` — Session type
 * See also: `app/src/store/briefingSlice.ts` — sessionMode, setSessionMode
 * Do NOT: Fetch outside of open event — sessions are loaded lazily on dropdown open
 */

import { useState, useEffect } from "react";
import { useStore } from "@/store";
import { fetchSessions } from "@/domain/session/api";
import type { Session } from "@/domain/session/types";
import { formatTokens } from "./AppHeader";

/** Converts an ISO 8601 timestamp into compact relative time (e.g., "2h ago", "yesterday"). */
function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "just now"; // Guard against future timestamps (clock skew)
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  if (hours < 48) return "yesterday";
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Dropdown that opens below the Generate button arrow, listing recent sessions.
 *
 * @param props.onClose - Called after a session is selected, so AppHeader can close the dropdown
 *
 * Upstream: `app/src/components/AppHeader/AppHeader.tsx`
 * Downstream: `app/src/domain/session/api.ts::fetchSessions`
 * Downstream: `app/src/store/briefingSlice.ts::setSessionMode`
 */
export function SessionDropdown({ onClose }: { onClose: () => void }) {
  const sessionMode = useStore((s) => s.sessionMode);
  const setSessionMode = useStore((s) => s.setSessionMode);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // Load sessions once on mount (dropdown is only rendered when open)
  useEffect(() => {
    fetchSessions()
      .then((data) => {
        // Sort by lastUsedAt DESC — sessions with no usage float to bottom
        const sorted = [...data].sort((a, b) => {
          const aTime = a.tokenUsage?.lastUsedAt ?? "";
          const bTime = b.tokenUsage?.lastUsedAt ?? "";
          if (bTime > aTime) return 1;
          if (aTime > bTime) return -1;
          return a.id.localeCompare(b.id); // Stable tiebreak
        });
        setSessions(sorted);
        setLoaded(true);
      })
      .catch(() => {
        setLoadError(true);
        setLoaded(true);
      });
  }, []);

  function handleSelectNew() {
    setSessionMode({ type: "new" });
    onClose();
  }

  function handleSelectSession(id: string) {
    setSessionMode({ type: "resume", sessionId: id });
    onClose();
  }

  const isNewSelected = sessionMode.type === "new";

  return (
    <div
      className="
        absolute right-0 top-full mt-1
        w-56
        bg-surface border border-border-subtle rounded-card shadow-lg
        overflow-hidden z-30
      "
    >
      {/* "✦ New Session" pinned at top */}
      <button
        onClick={handleSelectNew}
        className={`
          flex items-center justify-between w-full px-3 py-2 text-sm text-left
          hover:bg-surface-raised transition-colors
          border-b border-border-subtle
          ${
            isNewSelected
              ? "border-l-2 border-accent text-accent bg-surface-raised"
              : "border-l-2 border-transparent text-accent"
          }
        `}
      >
        <span className="font-medium">✦ New Session</span>
        {isNewSelected && (
          <span className="text-[10px] font-mono text-accent/60 uppercase tracking-wider">
            selected
          </span>
        )}
      </button>

      {/* Sessions list with scroll */}
      <div
        className="overflow-y-auto"
        style={{ maxHeight: "calc(5 * 2.5rem)" }}
      >
        {loadError && (
          <div className="px-3 py-2 text-xs text-muted italic">
            Failed to load sessions
          </div>
        )}
        {!loaded && !loadError && (
          <div className="px-3 py-2 text-xs text-muted italic">Loading…</div>
        )}
        {loaded && !loadError && sessions.length === 0 && (
          <div className="px-3 py-2 text-xs text-muted italic">
            No sessions yet
          </div>
        )}
        {sessions.map((session) => {
          const isSelected =
            sessionMode.type === "resume" &&
            sessionMode.sessionId === session.id;
          const tokenStr = session.tokenUsage
            ? formatTokens(session.tokenUsage.totalTokens)
            : "—";
          const timeStr = formatRelative(
            session.tokenUsage?.lastUsedAt ?? null,
          );
          // Type label: Work/News for briefing sessions, Chat for chat-only
          const typeLabel = session.briefingType
            ? session.briefingType.charAt(0).toUpperCase() +
              session.briefingType.slice(1)
            : "Chat";

          return (
            <button
              key={session.id}
              onClick={() => handleSelectSession(session.id)}
              className={`
                flex items-center justify-between w-full px-3 py-2 text-sm text-left
                hover:bg-surface-raised transition-colors
                ${
                  isSelected
                    ? "border-l-2 border-accent text-primary bg-surface-raised"
                    : "border-l-2 border-transparent text-primary"
                }
              `}
            >
              <span className="flex items-center gap-1.5 truncate flex-1 mr-2">
                <span className="font-mono text-[10px] text-accent/70 uppercase tracking-wider shrink-0">
                  {typeLabel}
                </span>
                <span className="font-mono text-[10px] text-muted/50">·</span>
                <span className="font-mono text-[10px] text-muted truncate">
                  {timeStr}
                </span>
              </span>
              <span className="font-mono text-[10px] text-muted/70 shrink-0 whitespace-nowrap">
                {tokenStr}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
