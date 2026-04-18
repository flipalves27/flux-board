import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import tsParser from "@typescript-eslint/parser";
import fluxZ from "./eslint-rules/flux-z-index-tokens.mjs";
import fluxShadow from "./eslint-rules/flux-shadow-tokens.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const compat = new FlatCompat({ baseDirectory: __dirname });

/**
 * UX v2 token guardrails — z-index + shadow (see `TOKENS.md`).
 * Extends `next/core-web-vitals` so inline `eslint-disable` comments for `@next/next/*`
 * and `react-hooks/*` resolve (same as root `eslint.config.mjs`).
 */
export default [
  ...compat.extends("next/core-web-vitals"),
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "context/**/*.{ts,tsx}"],
    ignores: ["**/emails/**", "**/*.test.*", "**/*.spec.*"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { fluxZ, fluxSh: fluxShadow },
    rules: {
      "fluxZ/z-index-tokens": "warn",
      "fluxSh/shadow-tokens": "warn",
    },
  },
];
