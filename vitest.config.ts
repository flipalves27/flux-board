import path from "path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    env: {
      JWT_SECRET: "vitest-jwt-secret-placeholder-min-32chars!",
    },
    environment: "jsdom",
    globals: true,
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: ["**/node_modules/**", "e2e/**"],
    coverage: {
      provider: "v8",
      include: [
        "lib/llm-utils.ts",
        "lib/slack-request-verify.ts",
        "lib/cron-secret.ts",
        "lib/jwt-secret.ts",
        "lib/env-validate.ts",
        "lib/cors-allowlist.ts",
      ],
      exclude: ["**/*.test.ts", "**/*.test.tsx", "**/node_modules/**"],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
