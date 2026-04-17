import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    clearMocks: true,
    restoreMocks: true,
  },
});
