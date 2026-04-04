import tsParser from "@typescript-eslint/parser";
import fluxPlugin from "./eslint-rules/flux-no-literal-colors.mjs";

/** Standalone config: only enforces Flux color tokens in UI sources (see package.json `lint:flux-colors`). */
export default [
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "context/**/*.{ts,tsx}"],
    ignores: [
      "**/emails/**",
      "**/*.test.*",
      "**/*.spec.*",
      // Brand icons must use vendor-specified literal colors (Google, Microsoft palette)
      "components/auth/google-icon.tsx",
      "components/auth/microsoft-icon.tsx",
      // BPMN diagram nodes/edges/panels use SVG literal colors per BPMN notation spec
      "components/bpmn/**",
      // Brand marks and decorative visual components with intentional literal palette
      "components/ui/flux-brand-mark.tsx",
      "components/fluxy/fluxy-avatar.tsx",
      // Data visualisation and chart colours are domain-specific literals
      "components/reports/cycle-time-scatter-panel.tsx",
      "components/kanban/board-knowledge-graph-panel.tsx",
      "components/kanban/collaboration-cursors.tsx",
      // Landing page visual mocks and template shape files
      "components/landing/landing-kanban-mock.tsx",
      "components/templates/bpmn-delivered-shapes.tsx",
      "components/templates/bpmn-icon-preview.tsx",
      "components/templates/bpmn-legend.tsx",
      "components/templates/bpmn-workspace.tsx",
      "components/templates/eisenhower-workspace.tsx",
      "components/templates/ai-template-conversation.tsx",
      // Org settings colour pickers use literal values by design
      "app/(org)/org-settings/page.tsx",
    ],
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
