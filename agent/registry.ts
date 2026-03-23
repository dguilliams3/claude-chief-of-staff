/**
 * Briefing type registry — maps type keys to prompt configs, timeouts, and data sources.
 *
 * Central source of truth for what briefing types exist. Adding a new type means
 * adding an entry here and a corresponding config module in `agent/briefings/<type>/`.
 *
 * Used by: `agent/run-briefing.ts`, `agent/cli.ts`, `server/local/routes/claude.ts`
 * See also: `agent/briefings/` — per-type prompt configs referenced by each type entry
 * Tested by: `agent/__tests__/registry.test.ts`
 */
import type { Prompt } from './prompts/types';
import { work } from './briefings/work/config';
import { news } from './briefings/news/config';
import briefingTypesMeta from '../shared/briefing-types.json';

/** Default timeout for briefing generation (10 minutes). MCP queries can be slow. */
export const DEFAULT_BRIEFING_TIMEOUT_MS = 600_000;

export interface BriefingTypeConfig {
  prompt: Prompt;
  description: string;
  label: string;          // display label for PWA tabs
  timeoutMs: number;
  sourcesSampled: string[];
}

/** Shared display metadata — single source of truth for type labels/descriptions. */
const metaByKey = Object.fromEntries(briefingTypesMeta.map(t => [t.key, t]));

export const briefingTypes: Record<string, BriefingTypeConfig> = {
  work: {
    prompt: work,
    description: metaByKey.work.description,
    label: metaByKey.work.label,
    timeoutMs: DEFAULT_BRIEFING_TIMEOUT_MS,
    sourcesSampled: ['jira', 'fireflies', 'daily-log'],
  },
  news: {
    prompt: news,
    description: metaByKey.news.description,
    label: metaByKey.news.label,
    timeoutMs: DEFAULT_BRIEFING_TIMEOUT_MS,
    sourcesSampled: ['huggingface', 'web'],
  },
};

export const validTypes = Object.keys(briefingTypes);
