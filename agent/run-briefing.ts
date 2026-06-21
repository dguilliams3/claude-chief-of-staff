/**
 * Main briefing orchestrator — compiles prompts, invokes Claude CLI, parses output,
 * persists locally, and syncs to D1.
 *
 * Pipeline: registry lookup -> prompt compile -> session resolve -> callClaude
 *           -> parseSections -> updateSession -> write JSON -> syncToD1
 *
 * Used by: `agent/cli.ts` (direct), `server/local/domain/briefing/routes.ts` (HTTP trigger)
 * See also: `agent/registry.ts` — type configs, `agent/claude-cli.ts` — CLI wrapper
 */
import { randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "./logger";
import { compile } from "./prompts/compile";
import { briefingTypes, validTypes } from "./registry";
import { buildClaudeArgs, callClaude, ClaudeCliError } from "./claude-cli";
import { extractJson } from "./extract-json";
import { ClaudeJsonEnvelope } from "./schemas";
import { parseSections } from "./parse-sections";
import { extractAssistantTexts } from "./session-jsonl";
import { readSessions, updateSession } from "./sessions";
import { syncToD1 } from "./sync";
import { parseCliUsage } from "./parse-cli-usage";
import type { CliUsage } from "./parse-cli-usage";
import { fetchAllSources, serializeFeedItems } from "./feeds/index";
import { readLocalFeeds } from "./local-config";

const AGENT_DIR = dirname(fileURLToPath(import.meta.url));
const BRIEFINGS_DIR = resolve(AGENT_DIR, "briefings");
const SESSIONS_FILE = resolve(AGENT_DIR, "sessions.json");

export interface RunBriefingOptions {
  type: string;
  newSession?: boolean;
  model?: string;
  /**
   * When provided, resumes this Claude session ID instead of performing
   * the usual sessions.json lookup. Takes precedence over newSession.
   *
   * Upstream: `server/local/domain/briefing/routes.ts` — trigger route (sessionId from PWA)
   * Upstream: `agent/cli.ts` — --resume-session flag
   */
  resumeSessionId?: string;
}

export interface BriefingResult {
  id: string;
  type: string;
  generatedAt: string;
  sessionId: string;
  sections: unknown[];
  metadata: {
    sourcesSampled: string[];
    runDurationMs: number;
    costUsd: number;
    sessionResumed: boolean;
    briefingNumber: number;
  };
  /** Token usage from the CLI response — null if parse failed or non-JSON output */
  usage: CliUsage | null;
}

/**
 * Runs a full briefing pipeline for the given type.
 * @param opts.type - Briefing type key (must exist in registry)
 * @param opts.newSession - If true, forces a fresh Claude session instead of resuming
 * @param opts.model - Optional model override (e.g., "claude-sonnet-4-20250514")
 * @param opts.resumeSessionId - If provided, resumes this session directly (skips sessions.json lookup)
 * @returns Complete BriefingResult with sections, metadata, and session info
 */
export async function runBriefing({
  type,
  newSession = false,
  model,
  resumeSessionId,
}: RunBriefingOptions): Promise<BriefingResult> {
  if (!validTypes.includes(type)) {
    throw new Error(
      `Invalid briefing type "${type}". Valid: ${validTypes.join(", ")}`,
    );
  }

  const config = briefingTypes[type];
  logger.info({ type, newSession, resumeSessionId }, "Starting briefing");

  // Session lookup: explicit resumeSessionId takes precedence over sessions.json lookup.
  // When resumeSessionId is provided (e.g. from PWA trigger), skip the file lookup entirely.
  let resumeId: string | undefined;
  if (resumeSessionId) {
    resumeId = resumeSessionId;
  } else if (!newSession) {
    const sessions = readSessions({ filePath: SESSIONS_FILE });
    const existingSession = sessions[type];
    resumeId = existingSession ? existingSession.session_id : undefined;
  }

  // Compile prompts
  const { system, user } = compile({ prompt: config.prompt });
  let finalUser = user;

  if (type === "community") {
    const configuredFeeds = readLocalFeeds();
    if (configuredFeeds.length > 0) {
      const feedItems = await fetchAllSources(configuredFeeds);
      logger.info({ feedItemCount: feedItems.length }, "Feed items fetched");
      finalUser = `${user}\n\n## Feed Data\n\n${serializeFeedItems(feedItems)}`;
    } else {
      logger.info("No local feeds configured; community briefing will run without feed data");
    }
  }
  logger.info(
    { systemLen: system.length, userLen: finalUser.length },
    "Prompts compiled",
  );

  // Build args and invoke Claude
  const args = buildClaudeArgs({
    system,
    resumeId,
    model,
    outputFormat: "json",
  });

  const startMs = Date.now();
  let response: string;
  let actuallyResumed = !!resumeId;
  try {
    response = await callClaude({
      args,
      input: finalUser,
      timeoutMs: config.timeoutMs,
    });
  } catch (err) {
    // Auto-retry on expired session: start a fresh session and try once more
    if (
      err instanceof ClaudeCliError &&
      err.code === "SESSION_EXPIRED" &&
      resumeId
    ) {
      logger.warn({ type }, "Session expired, retrying with fresh session");
      const freshArgs = buildClaudeArgs({
        system,
        model,
        outputFormat: "json",
      });
      response = await callClaude({
        args: freshArgs,
        input: finalUser,
        timeoutMs: config.timeoutMs,
      });
      actuallyResumed = false;
    } else {
      throw err;
    }
  }
  const durationMs = Date.now() - startMs;

  // Parse token usage from raw JSON (before extractJson strips the envelope)
  const usage = parseCliUsage(response);
  if (usage) {
    logger.info(
      {
        totalTokens: usage.totalTokens,
        contextWindow: usage.contextWindow,
        costUsd: usage.costUsd,
      },
      "Token usage parsed",
    );
  }

  // Parse and validate Claude JSON response
  const parsed = ClaudeJsonEnvelope.parse(JSON.parse(extractJson(response)));

  // Parse sections from result. Multi-turn tool-use sessions may produce the JSON
  // in a middle turn, with follow-up confirmations as the final turn that --print
  // returns. Three-level fallback: result field → full stdout → session JSONL.
  // Empty arrays from the first two strategies are treated as failures — a valid
  // briefing always has at least one section.
  let sections: unknown[] = [];

  try {
    sections = parseSections(parsed.result);
  } catch {
    logger.warn("parseSections failed on result field, trying full response");
  }

  if (sections.length === 0) {
    try {
      const fromResponse = parseSections(response);
      if (fromResponse.length > 0) sections = fromResponse;
    } catch {
      // fall through to JSONL
    }
  }

  if (sections.length === 0) {
    logger.warn("No sections from stdout, trying session JSONL");
    const texts = extractAssistantTexts(parsed.session_id);
    for (const text of texts) {
      try {
        const fromJsonl = parseSections(text);
        if (fromJsonl.length > 0) {
          sections = fromJsonl;
          logger.info(
            { source: "session-jsonl", count: fromJsonl.length },
            "Sections extracted from JSONL",
          );
          break;
        }
      } catch {
        // Not this message, try next
      }
    }
    if (sections.length === 0) {
      logger.error(
        { sessionId: parsed.session_id },
        "No sections found in any source",
      );
    }
  }
  logger.info({ sectionCount: sections.length }, "Sections parsed");

  // Update session (tracks whether the final call actually resumed or started fresh)
  const resumed = actuallyResumed;
  const sessionEntry = updateSession({
    filePath: SESSIONS_FILE,
    type,
    sessionId: parsed.session_id,
    resumed,
  });

  // Build briefing
  const briefing: BriefingResult = {
    id: randomUUID(),
    type,
    generatedAt: new Date().toISOString(),
    sessionId: parsed.session_id,
    sections,
    metadata: {
      sourcesSampled: config.sourcesSampled,
      runDurationMs: parsed.duration_ms ?? durationMs,
      costUsd: parsed.total_cost_usd ?? 0,
      sessionResumed: resumed,
      briefingNumber: sessionEntry.briefing_count,
    },
    usage,
  };

  // Write to file
  mkdirSync(BRIEFINGS_DIR, { recursive: true });
  // Include seconds + briefing ID to prevent filename collision within the same minute
  const filename = `${new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-")}-${type}-${briefing.id.slice(0, 8)}.json`;
  const filePath = resolve(BRIEFINGS_DIR, filename);
  writeFileSync(filePath, JSON.stringify(briefing, null, 2), "utf-8");
  logger.info({ filePath, durationMs }, "Briefing written");

  // Sync to D1 (non-fatal)
  await syncToD1({ briefing });

  return briefing;
}
