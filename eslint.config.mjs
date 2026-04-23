import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "coverage/**",
      "public/**",
      "*.config.mjs",
      "*.config.ts",
      "playwright.config.ts",
      "eslint-rules/**",
    ],
  },
  ...compat.extends("next/core-web-vitals"),
  {
    rules: {
      "react-hooks/exhaustive-deps": "off",
    },
  },
];
