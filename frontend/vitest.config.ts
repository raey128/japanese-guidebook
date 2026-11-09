import { defineConfig } from "vitest/config";

/**
 * Unit tests (Vitest). Kept apart from vite.config.ts because vitest 2 ships its own vite 5
 * types, which clash with the app's vite 6 plugins. No plugins are needed here: esbuild turns
 * the TSX into React's automatic JSX (tsconfig "jsx": "react-jsx"). Vitest reads this file in
 * preference to vite.config.ts.
 */
export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
