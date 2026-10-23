import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Test runner configuration.
 *
 * The suite targets the pure calculation, parsing, analytics, tool-registry and agent-orchestration
 * layers, so it runs in a plain Node environment with no DOM. `vite-tsconfig-paths` reuses the
 * `@/*` alias from tsconfig.json so tests import the same modules the app does.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    restoreMocks: true,
  },
});
