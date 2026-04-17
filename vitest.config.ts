import { defineConfig } from "vitest/config";

/**
 * Root-level vitest config — picks up standalone test files that live outside
 * any workspace (scripts, hooks). Workspace-level tests still run via their
 * own configs (agent, app, server/worker, server/local).
 *
 * Root test script composition in `package.json`:
 *   npm run test --workspace=agent
 *   && npm run test --workspace=app
 *   && npm run test --workspace=server/worker
 *   && npm run test --workspace=server/local
 *   && vitest run  (this config — scripts/__tests__ + .claude/hooks/__tests__)
 */
export default defineConfig({
  test: {
    include: [
      "scripts/__tests__/**/*.test.ts",
      ".claude/hooks/__tests__/**/*.test.ts",
    ],
    environment: "node",
    fileParallelism: false,
    clearMocks: true,
    restoreMocks: true,
  },
});
