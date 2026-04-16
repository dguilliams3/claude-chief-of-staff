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
import { community } from './prompts/community';
import { readLocalOverride } from './local-config';
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

interface BriefingTypeMeta {
  key: string;
  label: string;
  description: string;
}

/**
 * Merge tracked briefing metadata with optional local overrides/additions.
 * Local entries dedupe by `key` and take precedence.
 */
function loadBriefingTypes(): BriefingTypeMeta[] {
  const shared = briefingTypesMeta as BriefingTypeMeta[];
  const localRaw = readLocalOverride('briefing-types.json');
  if (!localRaw) return shared;

  try {
    const localTypes = JSON.parse(localRaw) as unknown;
    if (!Array.isArray(localTypes)) return shared;

    const merged = [...shared];
    for (const maybeType of localTypes) {
      if (!maybeType || typeof maybeType !== 'object') continue;

      const localType = maybeType as Partial<BriefingTypeMeta>;
      if (
        typeof localType.key !== 'string' ||
        typeof localType.label !== 'string' ||
        typeof localType.description !== 'string'
      ) {
        continue;
      }

      const idx = merged.findIndex((entry) => entry.key === localType.key);
      if (idx >= 0) {
        merged[idx] = localType as BriefingTypeMeta;
      } else {
        merged.push(localType as BriefingTypeMeta);
      }
    }
    return merged;
  } catch {
    return shared;
  }
}

const mergedBriefingTypesMeta = loadBriefingTypes();
const metaByKey = Object.fromEntries(mergedBriefingTypesMeta.map((t) => [t.key, t]));

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
  community: {
    prompt: community,
    description: metaByKey.community.description,
    label: metaByKey.community.label,
    timeoutMs: DEFAULT_BRIEFING_TIMEOUT_MS,
    sourcesSampled: ['configured-feeds', 'web'],
  },
};

export const validTypes = Object.keys(briefingTypes);
