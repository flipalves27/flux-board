import tsParser from "@typescript-eslint/parser";
import fluxZ from "./eslint-rules/flux-z-index-tokens.mjs";
import fluxShadow from "./eslint-rules/flux-shadow-tokens.mjs";

/** UX v2 token guardrails — z-index + shadow (see `TOKENS.md`). */
export default [
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
