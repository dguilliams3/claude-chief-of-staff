import { defineConfig } from 'vitest/config';

/**
 * Vitest config for the `server/local` workspace.
 *
 * Picks up tests colocated with their domain modules under `domain/**\/__tests__/`.
 */
export default defineConfig({
  test: {
    include: ['**/__tests__/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    clearMocks: true,
    restoreMocks: true,
  },
});
