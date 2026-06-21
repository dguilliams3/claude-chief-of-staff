/**
 * Zustand briefing slice -- briefing data, polling, trigger, history, and selection.
 *
 * Merged into the main CosStore via spread in store/index.ts.
 * Handles all briefing-related API calls and state management.
 * Trigger polling uses the shared `@/lib/polling` infrastructure (adaptive delays,
 * abort support, keyed concurrency) — no local setInterval.
 *
 * Used by: `app/src/store/index.ts` -- merged via createBriefingSlice()
 * See also: `app/src/domain/briefing/api.ts` -- HTTP client functions called by this slice
 * See also: `app/src/domain/briefing/types.ts` -- type contracts
 * See also: `app/src/lib/polling/` -- shared polling infrastructure
 * Do NOT: Call fetch directly -- use api.ts functions
 * Do NOT: Use setInterval -- use pollForResult from @/lib/polling
 */
import type {
  Briefing,
  BriefingListItem,
  BriefingTypeInfo,
} from "@/domain/briefing";
import {
  fetchBriefings,
  triggerBriefing as apiTrigger,
  fetchTriggerStatus,
  fetchBriefingList,
  fetchBriefingById,
  fetchBriefingTypes,
} from "@/domain/briefing";
import { pollForResult, stopPolling, stopAllPolling } from "@/lib/polling";
import { toast } from "@/lib/toast";

/** Poll key prefix for trigger polling — combined with jobId for uniqueness. */
const TRIGGER_POLL_KEY = "briefing-trigger";

interface ActiveTrigger {
  type: string;
  triggerStart: number;
  jobId: string;
}

/**
 * Determines whether the next briefing triggers a new Claude session or resumes an existing one.
 *
 * - `{ type: 'new' }` — default; passes `--new-session` to the CLI
 * - `{ type: 'resume', sessionId }` — resumes an existing session; passes `--resume <id>`
 *
 * Coupling: `app/src/components/AppHeader/SessionDropdown.tsx` — writes this via setSessionMode
 * Coupling: `agent/run-briefing.ts` — interprets the sessionId forwarded by the Worker
 * See also: `worker/src/domain/session/routes.ts` — session list used to populate the dropdown
 */
export type SessionMode =
  | { type: "new" }
  | { type: "resume"; sessionId: string };

export interface BriefingSlice {
  briefings: Record<string, Briefing>;
  loading: boolean;
  activeType: string;
  activeTrigger: ActiveTrigger | null;
  /**
   * Keys of briefing types this instance supports. Derived at runtime from
   * `GET /briefings/types` which reads `shared/briefing-types.json` merged
   * with optional `local/briefing-types.json`. Seeded with ['work', 'news']
   * as a fallback if the API fails; hydrated after auth.
   */
  availableTypes: readonly string[];
  /** Full briefing-type metadata (key, label, description) keyed by type. */
  typeMetadata: Record<string, BriefingTypeInfo>;
  sessionMode: SessionMode;

  // History / detail
  historyList: BriefingListItem[];
  historyLoading: boolean;
  selectedBriefingId: string | null;
  selectedBriefing: Briefing | null;

  // Actions
  setActiveType: (opts: { type: string }) => void;
  setSessionMode: (mode: SessionMode) => void;
  refresh: () => Promise<void>;
  silentRefresh: () => Promise<void>;
  refreshBriefingTypes: () => Promise<void>;
  triggerBriefing: () => Promise<void>;
  cancelTrigger: () => void;
  fetchHistory: () => Promise<void>;
  selectBriefing: (opts: { id: string | null }) => Promise<void>;
}

/** Stops briefing trigger polling. Exported for auth logout cleanup. */
export function stopBriefingPolling() {
  stopPolling(TRIGGER_POLL_KEY);
}

/** Stops all active polls (briefing + any others). Exported for auth logout cleanup. */
export { stopAllPolling };

async function fetchAndSet(set: (s: Partial<BriefingSlice>) => void) {
  try {
    const data = await fetchBriefings();
    set({ briefings: data as Record<string, Briefing> });
  } catch {
    // Leave briefings as-is on failure — components show empty state
  }
}

/** Exported for login hydration in store/index.ts. */
export { fetchAndSet };

type StoreGet = () => BriefingSlice;
type StoreSet = (partial: Partial<BriefingSlice>) => void;

/** Initial briefing data state — used by createBriefingSlice and logout reset. */
export const BRIEFING_INITIAL_STATE: Pick<
  BriefingSlice,
  | "briefings"
  | "loading"
  | "activeType"
  | "activeTrigger"
  | "availableTypes"
  | "typeMetadata"
  | "historyList"
  | "historyLoading"
  | "selectedBriefingId"
  | "selectedBriefing"
  | "sessionMode"
> = {
  briefings: {},
  loading: true,
  activeType: "work",
  activeTrigger: null,
  // Seed: derived types will hydrate from /briefings/types after auth.
  // Work + News are the guaranteed defaults (defined in shared/briefing-types.json).
  availableTypes: ["work", "news"],
  typeMetadata: {},
  historyList: [],
  historyLoading: false,
  selectedBriefingId: null,
  selectedBriefing: null,
  sessionMode: { type: "new" },
};

/**
 * Creates the briefing slice — briefing data, polling, trigger lifecycle, and history navigation.
 *
 * @param set - Zustand set function for partial state updates
 * @param get - Zustand get function for reading current state
 * @returns BriefingSlice with initial state and bound actions
 *
 * Upstream: `app/src/store/index.ts` — merged into CosStore via spread
 * Downstream: `app/src/domain/briefing/api.ts` — all briefing API functions
 * Downstream: `app/src/lib/polling/pollForResult.ts` — trigger polling lifecycle
 * Pattern: STORE-FIRST — actions write to store, components read via selectors
 * Tested by: `app/src/store/briefingSlice.test.ts`
 */
export function createBriefingSlice(
  set: StoreSet,
  get: StoreGet,
): BriefingSlice {
  return {
    ...BRIEFING_INITIAL_STATE,

    setActiveType({ type }: { type: string }) {
      set({ activeType: type });
    },

    /**
     * Updates the session mode for the next briefing trigger.
     *
     * @param mode - `{ type: 'new' }` or `{ type: 'resume', sessionId }`
     *
     * Upstream: `app/src/components/AppHeader/SessionDropdown.tsx` — user selects session
     * Downstream: `app/src/store/briefingSlice.ts::triggerBriefing` — reads sessionMode when triggering
     */
    setSessionMode(mode: SessionMode) {
      set({ sessionMode: mode });
    },

    async refresh() {
      set({ loading: true });
      await fetchAndSet(set);
      set({ loading: false });
    },

    async silentRefresh() {
      await fetchAndSet(set);
    },

    /**
     * Fetches the registered briefing types from the Worker and populates
     * `availableTypes` + `typeMetadata`. Should be called after auth hydration.
     * Silent on failure — state stays on the seeded ['work', 'news'] default.
     *
     * Downstream: `app/src/domain/briefing/api.ts::fetchBriefingTypes`
     */
    async refreshBriefingTypes() {
      try {
        const types = await fetchBriefingTypes();
        const metadata: Record<string, BriefingTypeInfo> = {};
        for (const t of types) metadata[t.key] = t;
        set({
          availableTypes: types.map((t) => t.key),
          typeMetadata: metadata,
        });
      } catch {
        // Leave seeded defaults in place on failure
      }
    },

    async triggerBriefing() {
      if (get().activeTrigger) return;

      const triggerType = get().activeType;
      const mode = get().sessionMode;
      const sessionId = mode.type === "resume" ? mode.sessionId : undefined;

      let jobId: string;
      try {
        const result = await apiTrigger({ type: triggerType, sessionId });
        jobId = result.jobId;
      } catch (err) {
        console.error("Trigger failed:", err);
        toast(
          `Briefing trigger failed: ${err instanceof Error ? err.message : "unknown error"}`,
          "error",
        );
        return;
      }

      const startedAt = Date.now();
      set({
        activeTrigger: { type: triggerType, triggerStart: startedAt, jobId },
      });

      // Stop any existing trigger poll before starting a new one
      stopPolling(TRIGGER_POLL_KEY);

      pollForResult(
        { pollKey: TRIGGER_POLL_KEY, startedAt },
        {
          async onComplete() {
            await get().silentRefresh();
            set({ activeTrigger: null, sessionMode: { type: "new" } });
          },
          onFailed(error) {
            console.error("Trigger job failed:", error);
            toast(`Briefing generation failed: ${error}`, "error");
            set({ activeTrigger: null, sessionMode: { type: "new" } });
          },
          onTimeout() {
            set({ activeTrigger: null, sessionMode: { type: "new" } });
          },
          onTerminalError() {
            set({ activeTrigger: null, sessionMode: { type: "new" } });
          },
        },
        async (signal) => {
          // Primary: check job status directly
          try {
            const job = await fetchTriggerStatus({ jobId, signal });
            return job;
          } catch (err) {
            // Re-throw 404 so pollForResult's terminal error detection kicks in
            // (job expired or server restarted — no point polling further)
            if (err instanceof Error && err.message.includes("404")) throw err;

            // Status endpoint unreachable — fall through to silentRefresh as fallback
            if (!signal.aborted) {
              await get().silentRefresh();
            }
            // Return 'running' so pollForResult schedules the next poll
            return { status: "running" as const };
          }
        },
      );
    },

    cancelTrigger() {
      stopPolling(TRIGGER_POLL_KEY);
      set({ activeTrigger: null });
    },

    async fetchHistory() {
      set({ historyLoading: true });
      try {
        const list = await fetchBriefingList();
        set({ historyList: list as BriefingListItem[], historyLoading: false });
      } catch {
        set({ historyLoading: false });
      }
    },

    async selectBriefing({ id }: { id: string | null }) {
      if (!id) {
        set({ selectedBriefingId: null, selectedBriefing: null });
        return;
      }
      set({ selectedBriefingId: id });
      try {
        const briefing = await fetchBriefingById({ id });
        set({ selectedBriefing: briefing as Briefing });
      } catch {
        set({ selectedBriefingId: null, selectedBriefing: null });
      }
    },
  };
}
