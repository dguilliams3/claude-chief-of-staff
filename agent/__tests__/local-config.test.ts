/**
 * Tests: `agent/local-config.ts::readLocalOverride`
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { readLocalOverride } from '../local-config';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const LOCAL_DIR = resolve(TEST_DIR, '..', '..', 'local');
const createdPaths: string[] = [];

afterEach(() => {
  for (const path of createdPaths.splice(0)) {
    rmSync(path, { force: true, recursive: true });
  }
});

describe('readLocalOverride', () => {
  it('returns trimmed content when override file exists', () => {
    const relativePath = '__vitest__/override.md';
    const fullPath = resolve(LOCAL_DIR, relativePath);

    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, '  custom persona  \n', 'utf-8');
    createdPaths.push(resolve(LOCAL_DIR, '__vitest__'));

    expect(readLocalOverride(relativePath)).toBe('custom persona');
  });

  it('returns null when override file is missing', () => {
    expect(readLocalOverride('__vitest__/missing.md')).toBeNull();
  });

  it('resolves nested paths relative to local directory', () => {
    const relativePath = '__vitest__/briefings/work-focus.md';
    const fullPath = resolve(LOCAL_DIR, relativePath);

    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, 'nested override', 'utf-8');
    createdPaths.push(resolve(LOCAL_DIR, '__vitest__'));

    expect(readFileSync(fullPath, 'utf-8')).toBe('nested override');
    expect(readLocalOverride(relativePath)).toBe('nested override');
  });
});
