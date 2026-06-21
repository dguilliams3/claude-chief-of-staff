/**
 * Community briefing prompt definition — digest from configured feed sources.
 *
 * Used by: `agent/registry.ts`
 */
import type { Prompt, PromptComponent } from './types';
import { readLocalOverride } from '../local-config';
import {
  persona,
  standardSources,
  subagentGuide,
  recencyBias,
  sessionContinuity,
  jsonSections,
} from './components';

const defaultCommunityFocus = `This is the community briefing. Summarize what's happening in the configured community feeds.

You will receive pre-fetched feed items from the user's selected sources as structured data in the prompt context.

Your job:
1. Summarize notable posts from the configured feeds and explain why each is worth reading.
2. Highlight active discussions or disagreement where signals are clear.
3. Keep output short and browsable, with direct links for tap-through.
4. Report clearly without over-editorializing on personal relevance.

If two sources discuss the same item, mention it once and note overlap.`;

const localCommunityFocus = readLocalOverride('briefings/community-focus.md');
const localGeneralFocus = readLocalOverride('briefing-focus.md');

export const community: Prompt = {
  name: 'community',
  components: [
    persona,
    standardSources,
    subagentGuide,
    {
      kind: 'focus',
      name: 'community-focus',
      content: localCommunityFocus ?? defaultCommunityFocus,
    },
    ...(localGeneralFocus ? [{
      kind: 'directive' as const,
      name: 'user-focus',
      content: localGeneralFocus,
    } satisfies PromptComponent] : []),
    recencyBias,
    sessionContinuity,
    jsonSections,
  ],
};
