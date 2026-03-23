/**
 * Claude CLI wrapper — shells out to `claude --print` for headless LLM invocations.
 *
 * Handles Windows cmd.exe quirks (shell:true, metacharacter escaping) and classifies
 * CLI failures into typed error codes for upstream handling.
 *
 * Used by: `agent/run-briefing.ts` (briefing generation), `server/local/domain/conversation/routes.ts` (follow-up)
 * See also: `agent/prompts/compile.ts` — builds the system/user prompts fed to callClaude
 * Do NOT: Pass resolved .cmd paths — cmd.exe mangles backslashes. Use bare 'claude' command.
 */
import { execFile } from 'node:child_process';
import { logger } from './logger';

// On Windows, .cmd files require shell:true (they're cmd.exe scripts, not PE executables).
// Using bare 'claude' with shell:true lets cmd.exe resolve via PATH+PATHEXT — proven working.
// Full resolved paths get mangled by cmd.exe backslash handling.
const CLAUDE_CMD = 'claude';

export type ClaudeErrorCode = 'NOT_FOUND' | 'TIMEOUT' | 'SESSION_EXPIRED' | 'PARSE_ERROR' | 'UNKNOWN';

/** Typed error for Claude CLI failures. Code field enables callers to branch on failure reason. */
export class ClaudeCliError extends Error {
  constructor(
    message: string,
    public readonly code: ClaudeErrorCode,
    public readonly stderr?: string,
  ) {
    super(message);
    this.name = 'ClaudeCliError';
  }
}

export interface BuildClaudeArgsOptions {
  system: string;
  resumeId?: string;
  model?: string;
  outputFormat?: 'json' | 'text';
  permissionMode?: string;
}

/**
 * Builds CLI argument array for `claude --print`.
 * @param opts - System prompt, optional resume session, model override, output format
 * @returns Argument array (excludes the `claude` command itself)
 */
export function buildClaudeArgs({
  system,
  resumeId,
  model,
  outputFormat = 'json',
  permissionMode = 'bypassPermissions',
}: BuildClaudeArgsOptions): string[] {
  const args = ['--print', '--output-format', outputFormat];

  if (permissionMode) args.push('--permission-mode', permissionMode);
  if (resumeId) args.push('--resume', resumeId);
  if (model) args.push('--model', model);
  // System prompt LAST — it's the longest arg and cmd.exe may mangle trailing args
  if (system) args.push('--system-prompt', system);

  return args;
}

export interface CallClaudeOptions {
  args: string[];
  input?: string;
  timeoutMs?: number;
}

/**
 * Invokes `claude` CLI as a child process and returns stdout.
 * @param opts - Pre-built args from buildClaudeArgs, optional stdin input, timeout
 * @returns Raw stdout from the CLI (JSON or text depending on outputFormat)
 * @throws {ClaudeCliError} with classified error code on failure
 */
export function callClaude({ args, input, timeoutMs = 600_000 }: CallClaudeOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    logger.info({ args: args.filter(a => a !== '--system-prompt' && !a.startsWith('You are')) }, 'Invoking claude CLI');

    // shell:true required on Windows — .cmd files are cmd.exe scripts, not executables.
    // Escape cmd.exe metacharacters in args to prevent & | ( ) etc from breaking the command.
    const escapedArgs = args.map(escapeCmdArg);
    const child = execFile(
      CLAUDE_CMD,
      escapedArgs,
      { timeout: timeoutMs, shell: true, env: { ...process.env, CLAUDECODE: undefined } },
      (err, stdout, stderr) => {
        if (err) {
          const code = classifyError(err, stderr);
          logger.error({ code, stderr: stderr?.slice(0, 200) }, 'Claude CLI failed');
          reject(new ClaudeCliError(stderr || err.message, code, stderr));
        } else {
          logger.info({ outputLen: stdout.length }, 'Claude CLI completed');
          resolve(stdout);
        }
      },
    );

    if (input) {
      child.stdin?.write(input);
      child.stdin?.end();
    }
  });
}

/** Escape cmd.exe metacharacters so shell:true doesn't interpret them.
 * Wrapping all args in double quotes is correct for cmd.exe — the Claude CLI
 * receives argv through Node's child_process which handles the unwrapping.
 * Proven working in production since RUN-20260305-1714. */
function escapeCmdArg(arg: string): string {
  if (process.platform !== 'win32') return arg;
  // Wrap in double quotes and escape internal double quotes.
  // cmd.exe metacharacters inside double quotes are safe except for: " % !
  // %VAR% triggers env expansion; !VAR! triggers delayed expansion.
  return `"${arg.replace(/"/g, '\\"').replace(/%/g, '%%').replace(/!/g, '^!')}"`;
}

/** Maps child_process error signals to a ClaudeErrorCode for structured handling. */
function classifyError(err: Error & { code?: string | number | null; killed?: boolean }, stderr: string): ClaudeErrorCode {
  if (err.code === 'ENOENT') return 'NOT_FOUND';
  if (err.killed) return 'TIMEOUT';
  if (stderr?.includes('No conversation found')) return 'SESSION_EXPIRED';
  return 'UNKNOWN';
}
