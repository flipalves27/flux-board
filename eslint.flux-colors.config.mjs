import tsParser from "@typescript-eslint/parser";
import fluxPlugin from "./eslint-rules/flux-no-literal-colors.mjs";

/** Standalone config: only enforces Flux color tokens in UI sources (see package.json `lint:flux-colors`). */
export default [
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "context/**/*.{ts,tsx}"],
    ignores: ["**/emails/**", "**/*.test.*", "**/*.spec.*"],
    linterOptions: {
      noInlineConfig: true,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { flux: fluxPlugin },
    rules: { "flux/no-literal-colors": "error" },
  },
];
