import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Backend/DB tests only for now (hence Node environment, not jsdom/browser).
// vite-tsconfig-paths lets test files use the `@/*` alias from tsconfig.json.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
  },
});
