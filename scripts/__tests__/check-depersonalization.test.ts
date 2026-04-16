import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT_SOURCE = resolve(process.cwd(), 'scripts/check-depersonalization.sh');
const tempDirs: string[] = [];

const literalName = ['Dan', 'Guilliams'].join(' ');
const literalOrg = ['Astral', 'Insights'].join(' ');
const literalDomain = ['dan', 'guilliams.com'].join('');
const literalUuid = ['5ec470d1-cb13-4775', '93ec-7d68bd41c7aa'].join('-');

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeRepo(): string {
  const repoDir = mkdtempSync(join(tmpdir(), 'depersonalization-'));
  tempDirs.push(repoDir);

  mkdirSync(join(repoDir, 'scripts'), { recursive: true });
  copyFileSync(SCRIPT_SOURCE, join(repoDir, 'scripts/check-depersonalization.sh'));

  execFileSync('git', ['init'], { cwd: repoDir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'tests@example.com'], { cwd: repoDir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'tests'], { cwd: repoDir, stdio: 'ignore' });
  return repoDir;
}

function stageFile(repoDir: string, path: string, content: string | Buffer): void {
  const fullPath = join(repoDir, path);
  mkdirSync(resolve(fullPath, '..'), { recursive: true });
  writeFileSync(fullPath, content);
  execFileSync('git', ['add', path], { cwd: repoDir, stdio: 'ignore' });
}

function runGuard(repoDir: string, extraPath?: string) {
  const envPath = extraPath ? `${extraPath};${process.env.PATH ?? ''}` : process.env.PATH;

  return spawnSync('bash', ['scripts/check-depersonalization.sh'], {
    cwd: repoDir,
    encoding: 'utf-8',
    env: {
      ...process.env,
      PATH: envPath,
    },
  });
}

describe('check-depersonalization.sh', () => {
  it('exits 0 when no files are staged', () => {
    const repoDir = makeRepo();
    const result = runGuard(repoDir);

    expect(result.status).toBe(0);
  });

  it('exits 0 for clean staged content', () => {
    const repoDir = makeRepo();
    stageFile(repoDir, 'notes.txt', 'clean text only');

    const result = runGuard(repoDir);

    expect(result.status).toBe(0);
  });

  it('exits 1 for staged content containing blocked personal name', () => {
    const repoDir = makeRepo();
    stageFile(repoDir, 'notes.txt', `hello ${literalName}`);

    const result = runGuard(repoDir);

    expect(result.status).toBe(1);
    expect(`${result.stdout}${result.stderr}`.trim().length).toBeGreaterThan(0);
  });

  it('exits 1 for staged content containing blocked organization', () => {
    const repoDir = makeRepo();
    stageFile(repoDir, 'notes.txt', `hello ${literalOrg}`);

    const result = runGuard(repoDir);

    expect(result.status).toBe(1);
  });

  it('exits 1 for staged content containing blocked domain', () => {
    const repoDir = makeRepo();
    stageFile(repoDir, 'notes.txt', `https://${literalDomain}`);

    const result = runGuard(repoDir);

    expect(result.status).toBe(1);
  });

  it('exits 1 for staged content containing blocked D1 UUID', () => {
    const repoDir = makeRepo();
    stageFile(repoDir, 'notes.txt', `db=${literalUuid}`);

    const result = runGuard(repoDir);

    expect(result.status).toBe(1);
  });

  it('exits 0 for whitelisted file path even when patterns appear', () => {
    const repoDir = makeRepo();
    stageFile(repoDir, 'docs/DEPERSONALIZATION.md', `${literalName}\n${literalOrg}\n${literalDomain}`);

    const result = runGuard(repoDir);

    expect(result.status).toBe(0);
  });

  it('exits 0 for binary staged file with forbidden bytes', () => {
    const repoDir = makeRepo();
    const fakeBinDir = join(repoDir, 'fake-bin');
    mkdirSync(fakeBinDir, { recursive: true });
    writeFileSync(join(fakeBinDir, 'file'), '#!/usr/bin/env bash\necho "$1: binary data"\n', 'utf-8');

    const binaryPayload = Buffer.concat([
      Buffer.from([0, 159, 146, 150]),
      Buffer.from(literalName, 'utf-8'),
      Buffer.from([0, 1, 2, 3]),
    ]);
    stageFile(repoDir, 'assets/blob.bin', binaryPayload);

    const result = runGuard(repoDir, fakeBinDir);

    expect(result.status).toBe(0);
  });
});
