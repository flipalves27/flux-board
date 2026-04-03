import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        /** Doc v2 aliases — map to the same CSS vars as `flux.*` */
        primary: "var(--primary, var(--flux-primary))",
        secondary: "var(--secondary, var(--flux-secondary))",
        accent: "var(--accent, var(--flux-accent))",
        surface: {
          base: "var(--bg-base, var(--flux-surface-dark))",
          raised: "var(--bg-raised, var(--flux-surface-mid))",
          card: "var(--bg-card, var(--flux-surface-card))",
        },
        flux: {
          primary: "var(--flux-primary)",
          "primary-light": "var(--flux-primary-light)",
          "primary-dark": "var(--flux-primary-dark)",
          secondary: "var(--flux-secondary)",
          accent: "var(--flux-accent)",
          "surface-dark": "var(--flux-surface-dark)",
          "surface-mid": "var(--flux-surface-mid)",
          "surface-card": "var(--flux-surface-card)",
          "surface-elevated": "var(--flux-surface-elevated)",
          success: "var(--flux-success)",
          warning: "var(--flux-warning)",
          danger: "var(--flux-danger)",
          info: "var(--flux-info)",
        },
      },
      spacing: {
        "flux-1": "var(--flux-space-1)",
        "flux-2": "var(--flux-space-2)",
        "flux-3": "var(--flux-space-3)",
        "flux-4": "var(--flux-space-4)",
        "flux-5": "var(--flux-space-5)",
        "flux-6": "var(--flux-space-6)",
        "flux-7": "var(--flux-space-7)",
        "flux-8": "var(--flux-space-8)",
        "flux-9": "var(--flux-space-9)",
        "flux-10": "var(--flux-space-10)",
        "flux-11": "var(--flux-space-11)",
        "flux-12": "var(--flux-space-12)",
      },
      fontSize: {
        "flux-xs": ["var(--flux-text-xs)", { lineHeight: "1.35" }],
        "flux-sm": ["var(--flux-text-sm)", { lineHeight: "1.4" }],
        "flux-base": ["var(--flux-text-base)", { lineHeight: "1.5" }],
        "flux-lg": ["var(--flux-text-lg)", { lineHeight: "1.45" }],
        "flux-xl": ["var(--flux-text-xl)", { lineHeight: "1.35" }],
        "flux-2xl": ["var(--flux-text-2xl)", { lineHeight: "1.3" }],
        "flux-3xl": ["var(--flux-text-3xl)", { lineHeight: "1.2" }],
      },
      boxShadow: {
        "flux-sm": "var(--flux-shadow-sm)",
        "flux-md": "var(--flux-shadow-md)",
        "flux-lg": "var(--flux-shadow-lg)",
        "flux-xl": "var(--flux-shadow-xl)",
        "flux-drag": "var(--flux-shadow-drag)",
      },
      transitionDuration: {
        "flux-fast": "150ms",
        "flux-normal": "250ms",
        "flux-slow": "400ms",
      },
      transitionTimingFunction: {
        "flux-standard": "var(--flux-ease-standard)",
      },
      screens: {
        "flux-xs": "400px",
        /** Doc breakpoints — align QA with design spec (Tailwind `md`/`lg` match 768 / 1024). */
        "doc-md": "768px",
        "doc-lg": "1024px",
      },
      fontFamily: {
        display: ["var(--font-display)", "Outfit", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "DM Sans", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "ui-monospace", "monospace"],
        fluxy: ["var(--font-fluxy)", "Space Grotesk", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
