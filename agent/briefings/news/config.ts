/**
 * News briefing prompt definition — AI landscape field intelligence.
 *
 * Composes persona + sources + directives + a news-specific focus section.
 * Exported as `news` (the briefing type name used by registry and CLI).
 *
 * Used by: `agent/registry.ts`
 * See also: `agent/briefings/work/config.ts` — the work briefing counterpart
 * See also: `agent/prompts/compile.ts` — assembles this into system/user strings
 */
import type { Prompt, PromptComponent } from '../../prompts/types';
import { readLocalOverride } from '../../local-config';
import {
  persona,
  standardSources,
  subagentGuide,
  recencyBias,
  sessionContinuity,
  jsonSections,
} from '../../prompts/components';

const defaultNewsFocus = `Provide a field intelligence briefing. What's happening in the user's configured topic
areas this week — new developments, releases, policy moves, research, industry shifts,
whatever's actually making noise.

Go find out. Use web search, Hugging Face, Context7, your training knowledge. If something
looks interesting but you're not sure if it holds up, dig deeper — spawn a subagent to
check benchmarks, look at the actual paper, compare claims to reality.

The user needs to:
- Know what's happening so they can speak to it when clients or peers bring it up
- Have their own informed take, not just a summary
- Know what actually affects their work vs. what's just getting attention
- Understand policy and regulation moves that affect their domain

Give your honest takes. Be skeptical but not dismissive. If something is getting hype,
the user needs to know about it AND know what to think about it. Structure the output
however makes sense for what you find — don't force categories. If it's a quiet week,
say so and keep it short.`;

const localNewsFocus = readLocalOverride('briefings/news-focus.md');
const localGeneralFocus = readLocalOverride('briefing-focus.md');

/** News briefing: landscape monitoring, industry developments, and emerging trends. */
export const news: Prompt = {
  name: 'news',
  components: [
    persona,
    standardSources,
    subagentGuide,
    {
      kind: 'focus',
      name: 'field-intel',
      content: localNewsFocus ?? defaultNewsFocus,
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
