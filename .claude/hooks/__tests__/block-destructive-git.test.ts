import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const HOOK_PATH = resolve(TEST_DIR, '..', 'block-destructive-git.py');

function runHook(command: string): { hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string } } {
  const input = {
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command },
  };

  const output = execFileSync('python', [HOOK_PATH], {
    input: JSON.stringify(input),
    encoding: 'utf-8',
  });

  return JSON.parse(output) as { hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string } };
}

describe('block-destructive-git.py', () => {
  it.each([
    'git reset --hard HEAD~5',
    'git clean -f',
    'git clean -xdf',
    'git checkout -- .',
    'git restore .',
  ])('blocks destructive command: %s', command => {
    const result = runHook(command);

    expect(result.hookSpecificOutput.permissionDecision).toBe('block');
    expect(result.hookSpecificOutput.permissionDecisionReason.length).toBeGreaterThan(0);
  });

  it.each([
    'git status',
    'git checkout main',
    'git reset HEAD file.ts',
    'git restore somefile.ts',
    'git clean -n',
  ])('allows safe command: %s', command => {
    const result = runHook(command);

    expect(result.hookSpecificOutput.permissionDecision).toBe('allow');
  });
});
