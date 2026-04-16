import { defineConfig } from "vitest/config";

/**
 * Vitest config for the `server/worker` workspace.
 *
 * Uses colocated `*.test.ts` files under `src/`. Pinned here so that vitest
 * does not walk up to the repo-root config (which is scoped to scripts/ and
 * .claude/hooks/ tests only).
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    clearMocks: true,
    restoreMocks: true,
  },
});
