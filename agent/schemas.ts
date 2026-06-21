/**
 * Zod schemas for runtime validation of external data boundaries.
 *
 * Replaces unsafe `as Type` casts with validated parsing at the CLI output boundary.
 *
 * Used by: `agent/run-briefing.ts` (validates claude --print JSON envelope)
 * See also: `agent/extract-json.ts` — extracts JSON from dirty CLI stdout first
 */
import { z } from 'zod/v4';

/** Schema for `claude --print --output-format json` response envelope. */
export const ClaudeJsonEnvelope = z.object({
  result: z.string(),
  session_id: z.string(),
  duration_ms: z.number().optional(),
  total_cost_usd: z.number().optional(),
});

export type ClaudeJsonEnvelope = z.infer<typeof ClaudeJsonEnvelope>;
