/**
 * Local override loader — reads per-user config from the gitignored local/ directory.
 *
 * Used by: `agent/prompts/components.ts`, `agent/briefings/<type>/config.ts`
 * See also: `local/README.md` — documents available override files
 */
import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const LOCAL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'local');

/**
 * Read a local override file if it exists.
 * @param relativePath - Path relative to local/ (e.g. 'persona.md')
 * @returns File content as string, or null if no override present.
 * Tested by: `agent/__tests__/local-config.test.ts`
 */
export function readLocalOverride(relativePath: string): string | null {
  const fullPath = resolve(LOCAL_DIR, relativePath);
  if (!fullPath.startsWith(LOCAL_DIR)) return null;
  if (existsSync(fullPath)) {
    return readFileSync(fullPath, 'utf-8').trim();
  }
  return null;
}
