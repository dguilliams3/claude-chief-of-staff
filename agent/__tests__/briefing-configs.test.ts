/**
 * Tests: `agent/briefings/work/config.ts::work`, `agent/briefings/news/config.ts::news`
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const LOCAL_DIR = resolve(TEST_DIR, '..', '..', 'local');
const workFocusPath = resolve(LOCAL_DIR, 'briefings', 'work-focus.md');
const newsFocusPath = resolve(LOCAL_DIR, 'briefings', 'news-focus.md');
const generalFocusPath = resolve(LOCAL_DIR, 'briefing-focus.md');

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

describe('briefing configs', () => {
  let workBackup: string | null = null;
  let newsBackup: string | null = null;
  let generalBackup: string | null = null;

  afterEach(() => {
    restore(workFocusPath, workBackup);
    restore(newsFocusPath, newsBackup);
    restore(generalFocusPath, generalBackup);
  });

  it('work config falls back to defaults and omits user-focus when no local files', async () => {
    workBackup = snapshot(workFocusPath);
    newsBackup = snapshot(newsFocusPath);
    generalBackup = snapshot(generalFocusPath);

    rmSync(workFocusPath, { force: true });
    rmSync(generalFocusPath, { force: true });

    vi.resetModules();
    const { work } = await import('../briefings/work/config');

    const focus = work.components.find((component) => component.name === 'morning-ops');
    const userFocus = work.components.find((component) => component.name === 'user-focus');

    expect(focus?.content).toContain('morning operational briefing');
    expect(userFocus).toBeUndefined();
  });

  it('work and news config include local focus directives when provided', async () => {
    workBackup = snapshot(workFocusPath);
    newsBackup = snapshot(newsFocusPath);
    generalBackup = snapshot(generalFocusPath);

    mkdirSync(dirname(workFocusPath), { recursive: true });
    writeFileSync(workFocusPath, 'work local focus', 'utf-8');
    writeFileSync(newsFocusPath, 'news local focus', 'utf-8');
    writeFileSync(generalFocusPath, 'general local focus', 'utf-8');

    vi.resetModules();
    const { work } = await import('../briefings/work/config');
    const { news } = await import('../briefings/news/config');

    const workFocus = work.components.find((component) => component.name === 'morning-ops');
    const newsFocus = news.components.find((component) => component.name === 'field-intel');
    const workUserFocus = work.components.find((component) => component.name === 'user-focus');
    const newsUserFocus = news.components.find((component) => component.name === 'user-focus');

    expect(workFocus?.content).toBe('work local focus');
    expect(newsFocus?.content).toBe('news local focus');
    expect(workUserFocus?.content).toBe('general local focus');
    expect(newsUserFocus?.content).toBe('general local focus');
  });
});
