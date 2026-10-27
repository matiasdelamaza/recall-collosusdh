import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // `server-only` lanza error fuera de React Server Components; en pruebas se neutraliza.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
});
