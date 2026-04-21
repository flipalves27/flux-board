import tsParser from "@typescript-eslint/parser";
import fluxAlpha from "./eslint-rules/flux-no-deprecated-alpha-tokens.mjs";
import fluxColors from "./eslint-rules/flux-no-literal-colors.mjs";
import fluxSvg from "./eslint-rules/flux-no-inline-svg.mjs";

const fluxPlugin = {
  rules: {
    ...fluxColors.rules,
    ...fluxAlpha.rules,
  },
};

const fluxSvgPlugin = { rules: { ...fluxSvg.rules } };

/** Gates Onda 4: cores literais (erro) + alpha tokens legados (warn → erro em fase final). */
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
    rules: {
      "flux/no-literal-colors": "error",
      "flux/no-deprecated-alpha-tokens": "warn",
    },
  },
  {
    files: ["components/landing/**/*.tsx"],
    ignores: ["**/emails/**", "**/*.test.*", "**/*.spec.*"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { flux: fluxSvgPlugin },
    rules: {
      "flux/no-inline-svg": "warn",
    },
  },
];
