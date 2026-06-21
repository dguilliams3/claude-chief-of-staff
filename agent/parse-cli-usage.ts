/**
 * Parses token usage metadata from `claude --print --output-format json` output.
 *
 * Extracts total tokens (input + cache creation), context window size, cost,
 * and session ID from the CLI's JSON response. Used after every callClaude
 * invocation to capture session metadata for context visibility.
 *
 * Upstream: `agent/run-briefing.ts` — briefing generation
 * Upstream: `server/local/domain/conversation/routes.ts` — follow-up execution
 * Downstream: Worker `PATCH /sessions/:id/usage` — persists to D1
 * See also: `agent/claude-cli.ts` — produces the raw JSON output
 */

/**
 * Parsed token usage from a Claude CLI JSON response.
 *
 * Coupling: `worker/src/domain/session/routes.ts::PATCH /sessions/:id/usage` — must match field names sent in body
 * See also: `app/src/domain/session/types.ts::SessionTokenUsage` — PWA-side representation (camelCase)
 */
export interface CliUsage {
  /** Session ID from the CLI response */
  sessionId: string;
  /** Total context tokens (input + cache creation) — proxy for "how full is the context" */
  totalTokens: number;
  /** Model's maximum context window (e.g. 1000000 for Opus) */
  contextWindow: number;
  /** Cost of this specific CLI call in USD */
  costUsd: number;
}

/**
 * Extracts token usage from the raw JSON output of `claude --print --output-format json`.
 *
 * @param jsonOutput - Raw stdout from callClaude (must be valid JSON)
 * @returns Parsed usage, or null if the output can't be parsed
 *
 * Upstream: `agent/run-briefing.ts` — briefing generation, passes usage to sync call
 * Upstream: `server/local/domain/conversation/routes.ts` — follow-up execution, passes usage to push-complete
 * Downstream: Worker `PATCH /sessions/:id/usage` — callers use the result to update session metadata
 */
export function parseCliUsage(jsonOutput: string): CliUsage | null {
  try {
    const data = JSON.parse(jsonOutput);

    const sessionId = data.session_id;
    if (!sessionId) return null;

    // Total context = input tokens + cache creation tokens
    // This represents how much of the context window is consumed
    const inputTokens = data.usage?.input_tokens ?? 0;
    const cacheCreationTokens = data.usage?.cache_creation_input_tokens ?? 0;
    const totalTokens = inputTokens + cacheCreationTokens;

    // Context window from model usage (e.g. 1000000 for Opus)
    const modelUsage = data.modelUsage ?? {};
    const firstModel = Object.values(modelUsage)[0] as Record<string, unknown> | undefined;
    const contextWindow = (firstModel?.contextWindow as number) ?? 0;

    const costUsd = data.total_cost_usd ?? 0;

    return { sessionId, totalTokens, contextWindow, costUsd };
  } catch {
    return null;
  }
}
