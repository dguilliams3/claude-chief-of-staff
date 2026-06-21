/**
 * Extracts a JSON object from potentially dirty CLI stdout.
 *
 * Handles clean output (fast path), markdown code fences, preamble text,
 * and trailing warnings that `claude --print` may emit.
 *
 * Used by: `agent/run-briefing.ts` (before JSON.parse + Zod validation)
 * See also: `agent/schemas.ts` — Zod schemas for the extracted JSON
 */

/**
 * Extracts the first JSON object from raw CLI output.
 * @param raw - Raw stdout from `claude --print`
 * @returns Clean JSON string ready for JSON.parse
 * @throws {Error} if no JSON object is found in the output
 */
export function extractJson(raw: string): string {
  const trimmed = raw.trim();

  // Strip markdown fences: ```json { ... } ```
  const fenceMatch = trimmed.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
  if (fenceMatch) return fenceMatch[1];

  // Find the first { and its matching } using brace counting.
  // Regex alone can't reliably match nested braces, and CLI output
  // may have trailing text after the JSON object.
  const start = trimmed.indexOf('{');
  if (start === -1) throw new Error('No JSON object found in CLI output');

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    if (ch === '}') { depth--; if (depth === 0) return trimmed.slice(start, i + 1); }
  }

  throw new Error('No JSON object found in CLI output');
}
