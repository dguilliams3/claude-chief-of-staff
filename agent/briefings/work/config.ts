/**
 * Work briefing prompt definition — morning operational briefing.
 *
 * Composes persona + sources + directives + a work-specific focus section.
 * Exported as `work` (the briefing type name used by registry and CLI).
 *
 * Used by: `agent/registry.ts`
 * See also: `agent/briefings/news/config.ts` — the news briefing counterpart
 * See also: `agent/prompts/compile.ts` — assembles this into system/user strings
 */
import type { Prompt, PromptComponent } from '../../prompts/types';
import { readLocalOverride } from '../../local-config';
import {
  persona,
  standardSources,
  subagentGuide,
  skepticism,
  recencyBias,
  sessionContinuity,
  jsonSections,
} from '../../prompts/components';

const defaultWorkFocus = `This is the morning operational briefing. The user reads this to know where things stand.

Recency matters. Focus on the last 7 days. Old tickets and stale projects are noise unless
something changed. If a client engagement hasn't had a meeting or commit in 2+ weeks,
mention it once as "quiet" and move on — don't give it a full section.

What they care about:
- What's active RIGHT NOW? Which projects had meetings or deliverables this week?
- What was actually shipped or worked on in the last few days (git, commits, PRs)?
- Are there commitments from recent meetings that aren't tracked in Jira?
- Is anything stuck or drifting that should be dealt with today?
- What's coming up in the next few days (upcoming meetings, deadlines)?

Don't summarize the whole Jira backlog. Focus on what moved, what's new, and what's
about to matter. Cross-reference recent meetings with recent git activity and Jira
transitions. The gaps between systems are the most valuable part.`;

const localWorkFocus = readLocalOverride('briefings/work-focus.md');
const localGeneralFocus = readLocalOverride('briefing-focus.md');

/** Work briefing: ops-focused, cross-references Jira/meetings/git for gaps. */
export const work: Prompt = {
  name: 'work',
  components: [
    persona,
    standardSources,
    subagentGuide,
    {
      kind: 'focus',
      name: 'morning-ops',
      content: localWorkFocus ?? defaultWorkFocus,
    },
    ...(localGeneralFocus ? [{
      kind: 'directive' as const,
      name: 'user-focus',
      content: localGeneralFocus,
    } satisfies PromptComponent] : []),
    skepticism,
    recencyBias,
    sessionContinuity,
    jsonSections,
  ],
};
