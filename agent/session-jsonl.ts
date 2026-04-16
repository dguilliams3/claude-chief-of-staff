/**
 * Session JSONL reader — extracts assistant text messages from Claude Code
 * session transcripts for fallback section parsing.
 *
 * Claude Code stores session transcripts as JSONL files under
 * `~/.claude/projects/<project-slug>/<sessionId>.jsonl`. In multi-turn
 * tool-use sessions, the briefing JSON may appear in a middle turn while
 * `--print` only returns the last turn. This module enables searching all
 * turns for the sections array.
 *
 * Used by: `agent/run-briefing.ts` — third fallback when parseSections fails on stdout
 * See also: `agent/parse-sections.ts` — the parser that consumes the extracted text
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { logger } from './logger';

/**
 * Finds the JSONL transcript file for a given session ID by searching
 * Claude Code's project directories under ~/.claude/projects/.
 */
function findSessionJsonlPath(sessionId: string): string | null {
  const projectsDir = join(homedir(), '.claude', 'projects');
  if (!existsSync(projectsDir)) return null;

  for (const dir of readdirSync(projectsDir, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const candidate = join(projectsDir, dir.name, `${sessionId}.jsonl`);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Extracts all assistant text content from a session JSONL file.
 * Returns texts sorted by length descending — the full briefing JSON
 * is typically the longest assistant message in the session.
 *
 * @param sessionId - Claude Code session ID (from the JSON envelope)
 * @returns Assistant text messages, longest first. Empty array if JSONL not found.
 */
export function extractAssistantTexts(sessionId: string): string[] {
  const jsonlPath = findSessionJsonlPath(sessionId);
  if (!jsonlPath) {
    logger.warn({ sessionId }, 'Session JSONL not found');
    return [];
  }

  logger.info({ jsonlPath }, 'Reading session JSONL for fallback section extraction');
  const lines = readFileSync(jsonlPath, 'utf8').trim().split('\n');
  const texts: string[] = [];

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.type !== 'assistant') continue;

      const content = entry.message?.content;
      if (!Array.isArray(content)) continue;

      for (const block of content) {
        if (block.type === 'text' && block.text?.trim()) {
          texts.push(block.text.trim());
        }
      }
    } catch {
      // Skip malformed JSONL lines
    }
  }

  // Sort by length descending — briefing JSON is the longest message
  return texts.sort((a, b) => b.length - a.length);
}
