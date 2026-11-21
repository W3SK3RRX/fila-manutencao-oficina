import { defineConfig } from "vitest/config";

// Backend/DB tests only for now (hence Node environment, not jsdom/browser).
// resolve.tsconfigPaths lets test files use the `@/*` alias from tsconfig.json.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    // All tests/db/*.test.ts files share one mutable Postgres database, and
    // pegar_proximo is global by design, so files must run one at a time.
    fileParallelism: false,
  },
});
