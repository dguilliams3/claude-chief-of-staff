/**
 * Prompt compiler — assembles a Prompt's components into { system, user } strings
 * ready for claude CLI invocation.
 *
 * The persona component becomes the system prompt; all other components are
 * concatenated (with date header) into the user prompt.
 *
 * Used by: `agent/prompts/index.ts`
 * See also: `agent/prompts/types.ts` — Prompt / PromptComponent definitions
 * See also: `agent/prompts/components.ts` — reusable component library
 */
import type { Prompt } from './types';

/**
 * Compiles a Prompt definition into system + user strings for claude CLI.
 *
 * @param prompt - The named prompt definition (e.g., work or news)
 * @param vars - Optional overrides; supports DATE (ISO) and DATE_HUMAN (readable)
 * @returns `{ system, user }` — system is persona content, user is assembled sections
 * Tested by: `agent/__tests__/compile.test.ts`
 */
export function compile({
  prompt,
  vars = {},
}: {
  prompt: Prompt;
  vars?: Record<string, string>;
}): { system: string; user: string } {
  const persona = prompt.components.find((c) => c.kind === 'persona');
  const rest = prompt.components.filter((c) => c.kind !== 'persona');

  const date =
    vars.DATE ?? new Date().toISOString();
  const dateHuman =
    vars.DATE_HUMAN ??
    new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

  const lines: string[] = [
    `Today is ${date} (${dateHuman}).`,
    '',
  ];

  for (const c of rest) {
    lines.push(`## ${c.name}`);
    lines.push(c.content);
    lines.push('');
  }

  return {
    system: persona?.content ?? '',
    user: lines.join('\n'),
  };
}
