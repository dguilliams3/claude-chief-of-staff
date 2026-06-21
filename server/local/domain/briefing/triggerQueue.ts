/**
 * In-process trigger queue — deduplicates briefing runs per type and tracks job status.
 *
 * Prevents concurrent briefing runs of the same type and provides status lookup
 * for the PWA to poll instead of blindly checking /briefings/latest.
 *
 * Used by: `server/local/domain/briefing/routes.ts` — /trigger and /status/:jobId endpoints
 * Do NOT: Persist jobs to disk — in-memory is correct for a single-process server.
 *         Jobs auto-expire after RETENTION_MS to prevent memory leaks.
 */

export type JobStatus = 'running' | 'completed' | 'failed';

export interface Job {
  id: string;
  type: string;
  status: JobStatus;
  createdAt: string;
  completedAt?: string;
  briefingId?: string;
  error?: string;
}

/** How long completed/failed jobs stay in the status map before expiry. */
const RETENTION_MS = 30 * 60 * 1000; // 30 minutes

/** Jobs by ID — for status lookup. */
const jobs = new Map<string, Job>();

/** Currently active job ID per briefing type — for dedup. */
const activeByType = new Map<string, string>();

/** Returns the active job ID for a briefing type, or undefined if none is running. */
export function getActiveJobId(type: string): string | undefined {
  return activeByType.get(type);
}

/**
 * Attempts to enqueue a briefing run. Returns null if a run of that type is already active.
 * @returns Job if enqueued, null if deduplicated
 */
export function enqueueJob(type: string): Job | null {
  if (activeByType.has(type)) return null;

  const job: Job = {
    id: crypto.randomUUID(),
    type,
    status: 'running',
    createdAt: new Date().toISOString(),
  };

  jobs.set(job.id, job);
  activeByType.set(type, job.id);
  return job;
}

/**
 * Marks a job as completed with the resulting briefing ID.
 */
export function completeJob(jobId: string, briefingId: string): void {
  const job = jobs.get(jobId);
  if (!job) return;
  job.status = 'completed';
  job.completedAt = new Date().toISOString();
  job.briefingId = briefingId;
  activeByType.delete(job.type);
  scheduleExpiry(jobId);
}

/**
 * Marks a job as failed with an error message.
 */
export function failJob(jobId: string, error: string): void {
  const job = jobs.get(jobId);
  if (!job) return;
  job.status = 'failed';
  job.completedAt = new Date().toISOString();
  job.error = error;
  activeByType.delete(job.type);
  scheduleExpiry(jobId);
}

/**
 * Looks up a job by ID. Returns undefined if expired or never existed.
 */
export function getJob(jobId: string): Job | undefined {
  return jobs.get(jobId);
}

function scheduleExpiry(jobId: string): void {
  setTimeout(() => jobs.delete(jobId), RETENTION_MS);
}
