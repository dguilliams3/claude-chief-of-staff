/**
 * Session file read/write — tracks Claude CLI session IDs per briefing type.
 *
 * Persists session state to `agent/sessions.json` so briefings can resume
 * existing conversations instead of starting fresh each run.
 * Uses atomic write (tmp + rename) to avoid corruption on crash.
 *
 * Used by: `agent/run-briefing.ts` — reads before invocation, writes after
 * See also: `server/local/routes/claude.ts` — follow-up endpoint uses stored session IDs
 */
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { logger } from './logger';

interface SessionEntry {
  session_id: string;
  created_at: string;
  last_used_at: string;
  briefing_count: number;
}

type SessionStore = Record<string, SessionEntry>;

/**
 * Reads the session store from disk. Creates an empty file if none exists.
 * @param opts.filePath - Absolute path to sessions.json
 * Tested by: `agent/__tests__/sessions.test.ts`
 */
export function readSessions({ filePath }: { filePath: string }): SessionStore {
  if (!existsSync(filePath)) {
    writeFileSync(filePath, '{}', 'utf-8');
    return {};
  }
  return JSON.parse(readFileSync(filePath, 'utf-8')) as SessionStore;
}

/**
 * Upserts a session entry and writes back to disk atomically (tmp + rename).
 * @param opts.filePath - Absolute path to sessions.json
 * @param opts.type - Briefing type key (e.g., "work", "news")
 * @param opts.sessionId - Claude CLI session ID from latest run
 * @param opts.resumed - Whether this was a resumed session (affects created_at/count)
 * @returns The updated SessionEntry
 * Tested by: `agent/__tests__/sessions.test.ts`
 */
export function updateSession({
  filePath,
  type,
  sessionId,
  resumed,
}: {
  filePath: string;
  type: string;
  sessionId: string;
  resumed: boolean;
}): SessionEntry {
  const store = readSessions({ filePath });
  const now = new Date().toISOString();
  const existing = store[type];

  const entry: SessionEntry = {
    session_id: sessionId,
    created_at: resumed && existing ? existing.created_at : now,
    last_used_at: now,
    briefing_count: resumed && existing ? existing.briefing_count + 1 : 1,
  };

  store[type] = entry;

  // Unique temp filename avoids race when concurrent runs write simultaneously
  const tmpPath = `${filePath}.${process.pid}-${Math.random().toString(36).slice(2)}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(store, null, 2), 'utf-8');
  renameSync(tmpPath, filePath);

  logger.info({ type, sessionId, count: entry.briefing_count }, 'Session updated');
  return entry;
}
