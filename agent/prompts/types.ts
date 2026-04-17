/**
 * Type definitions for the prompt composition system.
 *
 * Prompts are built from typed components (persona, sources, directives, etc.)
 * and compiled into { system, user } strings by compile().
 *
 * Used by: all files in `agent/prompts/`
 * See also: `agent/prompts/compile.ts` — consumes these types
 */

/** Discriminator for prompt components. Determines role in compiled output. */
export type ComponentKind =
  | 'persona'           // Who you are — becomes system prompt
  | 'sources'           // What you have access to
  | 'subagent-guide'    // How to think about delegation
  | 'focus'             // What I care about right now
  | 'output'            // What shape to return
  | 'directive';        // Behavioral bias / philosophy

/** A single composable piece of a prompt. */
export interface PromptComponent {
  kind: ComponentKind;
  name: string;
  content: string;
}

/** A named prompt definition — an ordered list of components. */
export interface Prompt {
  name: string;
  components: PromptComponent[];
}
