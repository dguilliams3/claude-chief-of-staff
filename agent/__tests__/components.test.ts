/**
 * Tests: `agent/prompts/components.ts::persona`
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const LOCAL_DIR = resolve(TEST_DIR, '..', '..', 'local');
const personaPath = resolve(LOCAL_DIR, 'persona.md');
const subagentGuidePath = resolve(LOCAL_DIR, 'subagent-guide.md');

function snapshot(path: string): string | null {
  return existsSync(path) ? readFileSync(path, 'utf-8') : null;
}

function restore(path: string, value: string | null): void {
  if (value === null) {
    rmSync(path, { force: true });
    return;
  }

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value, 'utf-8');
}

describe('prompt components', () => {
  let personaBackup: string | null = null;
  let subagentGuideBackup: string | null = null;

  afterEach(() => {
    restore(personaPath, personaBackup);
    restore(subagentGuidePath, subagentGuideBackup);
  });

  it('uses default persona when local override is absent', async () => {
    personaBackup = snapshot(personaPath);
    rmSync(personaPath, { force: true });

    vi.resetModules();
    const { persona } = await import('../prompts/components');

    expect(persona.kind).toBe('persona');
    expect(persona.content).toContain('You are an AI briefing assistant');
  });

  it('uses local persona override when present', async () => {
    personaBackup = snapshot(personaPath);
    mkdirSync(dirname(personaPath), { recursive: true });
    writeFileSync(personaPath, '  local persona voice  \n', 'utf-8');

    vi.resetModules();
    const { persona } = await import('../prompts/components');

    expect(persona.content).toBe('local persona voice');
  });

  it('uses default subagent guide when local override is absent', async () => {
    subagentGuideBackup = snapshot(subagentGuidePath);
    rmSync(subagentGuidePath, { force: true });

    vi.resetModules();
    const { subagentGuide } = await import('../prompts/components');

    expect(subagentGuide.kind).toBe('subagent-guide');
    expect(subagentGuide.content).toContain('ALL data gathering MUST happen via Sonnet subagents');
  });

  it('re-reads local subagent guide on each access (not cached)', async () => {
    subagentGuideBackup = snapshot(subagentGuidePath);
    mkdirSync(dirname(subagentGuidePath), { recursive: true });

    vi.resetModules();
    const { subagentGuide } = await import('../prompts/components');

    writeFileSync(subagentGuidePath, 'first guide', 'utf-8');
    expect(subagentGuide.content).toBe('first guide');

    writeFileSync(subagentGuidePath, 'second guide', 'utf-8');
    expect(subagentGuide.content).toBe('second guide');
  });
});
