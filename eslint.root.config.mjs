import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

/**
 * Shared root ESLint config for non-app TypeScript surfaces in the public fork.
 *
 * Covers scripts plus production Node/Worker TypeScript under `agent/` and `server/`
 * without importing private harness doctrine or relying on workspace-local lint
 * lookup quirks. Tests in agent/server stay out of this ratchet for now because
 * they still carry separate cleanup debt; the public-facing production surfaces do not.
 */
export default defineConfig([
  globalIgnores(['dist', 'node_modules', '**/*.d.ts', 'agent/**/*.test.ts', 'server/**/*.test.ts']),
  {
    files: ['scripts/**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['agent/**/*.ts', 'server/**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      'no-console': 'off',
    },
  },
]);
