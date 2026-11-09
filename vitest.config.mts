import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // Next's server-only guard has no meaning outside the Next bundler.
      "server-only": path.resolve(import.meta.dirname, "src/test/empty.ts"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
