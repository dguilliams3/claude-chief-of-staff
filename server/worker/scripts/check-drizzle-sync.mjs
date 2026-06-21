import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { dirname, join, parse } from 'node:path';

const root = process.cwd();
const checkDir = join(root, '.drizzle-check');

function resolveDrizzleKitBin(startDir) {
  const filesystemRoot = parse(startDir).root;
  let current = startDir;
  while (true) {
    const candidate = join(current, 'node_modules', 'drizzle-kit', 'bin.cjs');
    if (existsSync(candidate)) return candidate;
    if (current === filesystemRoot) return null;
    current = dirname(current);
  }
}

const drizzleKitBin = resolveDrizzleKitBin(root);
if (!drizzleKitBin) {
  console.error(
    'check-drizzle-sync: could not locate node_modules/drizzle-kit/bin.cjs in any parent of',
    root,
  );
  process.exit(1);
}

function run(args, options = {}) {
  const result = spawnSync(process.execPath, [drizzleKitBin, ...args], {
    cwd: root,
    encoding: 'utf8',
    ...options,
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (options.stdio === 'inherit') {
    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
    return '';
  }

  if (result.status !== 0) {
    process.stdout.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    process.exit(result.status ?? 1);
  }

  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

await rm(checkDir, { recursive: true, force: true });

try {
  run(['check', '--config', 'drizzle.config.ts'], { stdio: 'inherit' });

  await mkdir(join(checkDir, 'meta'), { recursive: true });
  await cp(join(root, 'migrations', 'meta'), join(checkDir, 'meta'), { recursive: true });

  const output = run([
    'generate',
    '--dialect',
    'sqlite',
    '--schema',
    './src/db/schema.ts',
    '--out',
    '.drizzle-check',
    '--name',
    'schema_check',
  ]);
  process.stdout.write(output);

  const generatedSql = existsSync(checkDir)
    ? (await readdir(checkDir)).filter((entry) => entry.endsWith('.sql'))
    : [];

  if (generatedSql.length > 0) {
    console.error(
      [
        'Schema drift detected: drizzle-kit generated a migration in .drizzle-check.',
        `Generated files: ${generatedSql.join(', ')}`,
        'Run npm run db:generate, review the SQL, and commit the resulting migration.',
      ].join('\n'),
    );
    process.exit(1);
  }
} finally {
  if (process.exitCode !== 1) {
    await rm(checkDir, { recursive: true, force: true });
  }
}
