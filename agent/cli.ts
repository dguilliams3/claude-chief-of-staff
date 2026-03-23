/**
 * CLI entry point — runs a briefing from the command line.
 *
 * Usage: `npx tsx agent/cli.ts <work|news> [--new-session] [--model <model>] [--resume-session <sessionId>]`
 *
 * Used by: cron jobs, manual terminal invocations
 * See also: `agent/run-briefing.ts` — the orchestrator this delegates to
 * Tests: `agent/cli.test.ts`
 */
import 'dotenv/config';
import { runBriefing } from './run-briefing';
import { validTypes } from './registry';
import { logger } from './logger';

/** Parses CLI arguments into briefing options. Exported for testing. */
export function parseArgs(argv: string[]) {
  const type = argv[2];
  const newSession = argv.includes('--new-session');
  const modelIdx = argv.indexOf('--model');
  const model = modelIdx !== -1 ? argv[modelIdx + 1] : undefined;
  const resumeIdx = argv.indexOf('--resume-session');
  const resumeSessionId = resumeIdx !== -1 ? argv[resumeIdx + 1] : undefined;
  return { type, newSession, model, resumeSessionId };
}

// Only run when executed directly (not when imported for testing)
const isDirectRun = process.argv[1]?.endsWith('cli.ts') || process.argv[1]?.endsWith('cli');

if (isDirectRun) {
  const { type, newSession, model, resumeSessionId } = parseArgs(process.argv);

  if (!type || !validTypes.includes(type)) {
    console.error(`Usage: npx tsx agent/cli.ts <${validTypes.join('|')}> [--new-session] [--model <model>] [--resume-session <sessionId>]`);
    process.exit(1);
  }

  runBriefing({ type, newSession, model, resumeSessionId })
    .then(b => logger.info({ id: b.id, sections: b.sections.length, durationMs: b.metadata.runDurationMs }, 'Briefing complete'))
    .catch(err => { logger.error({ err }, 'Briefing failed'); process.exit(1); });
}
