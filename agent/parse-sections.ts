/**
 * Zod-validated section parser — extracts structured briefing sections from Claude output.
 *
 * Claude's raw output may be clean JSON, double-encoded, or embedded in prose.
 * This module tries three extraction strategies in order before failing.
 *
 * Used by: `agent/run-briefing.ts` — parses the `result` field from Claude CLI JSON
 * See also: `agent/prompts/` — prompt templates that instruct Claude to output this schema
 */
import { z } from 'zod/v4';

/** Single briefing section with severity indicator. */
const SectionSchema = z.object({
  key: z.string(),
  label: z.string(),
  content: z.string(),
  severity: z.enum(['info', 'warn', 'flag']),
});

const SectionsSchema = z.array(SectionSchema);
export type Section = z.infer<typeof SectionSchema>;

/**
 * Extracts and validates a Section[] from Claude's raw output string.
 * Tries: direct JSON parse, double-decode, regex extraction — in that order.
 * @param raw - Raw string from Claude CLI response (may contain surrounding text)
 * @returns Validated array of Section objects
 * @throws {Error} if no strategy can extract valid sections
 * Tested by: `agent/__tests__/parse-sections.test.ts`
 */
export function parseSections(raw: string): Section[] {
  // Strategy 1: raw is a clean JSON array
  try {
    const parsed = JSON.parse(raw);
    return SectionsSchema.parse(parsed);
  } catch { /* try next */ }

  // Strategy 2: raw is a double-encoded JSON string
  try {
    const unescaped = JSON.parse(raw);
    if (typeof unescaped === 'string') {
      const parsed = JSON.parse(unescaped);
      return SectionsSchema.parse(parsed);
    }
  } catch { /* try next */ }

  // Strategy 3: JSON array embedded in surrounding text — bracket-counting extraction
  try {
    const extracted = extractJsonArray(raw);
    if (extracted) {
      const parsed = JSON.parse(extracted);
      return SectionsSchema.parse(parsed);
    }
  } catch { /* fall through */ }

  throw new Error(
    `Could not parse sections from Claude response. Raw (first 300 chars): ${raw.slice(0, 300)}`,
  );
}

/** Extracts a JSON array from text using bracket-counting (not greedy regex). */
function extractJsonArray(text: string): string | null {
  const start = text.indexOf('[');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '[') depth++;
    if (ch === ']') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}
