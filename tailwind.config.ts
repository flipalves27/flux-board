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
        flux: {
          primary: "#6C5CE7",
          "primary-light": "#A29BFE",
          "primary-dark": "#4834D4",
          secondary: "#00D2D3",
          accent: "#FDA7DF",
          "surface-dark": "#0D0B1A",
          "surface-mid": "#1A1730",
          "surface-card": "#221F3A",
          "surface-elevated": "#2D2952",
          success: "#00E676",
          warning: "#FFD93D",
          danger: "#FF6B6B",
          info: "#74B9FF",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Outfit", "sans-serif"],
        body: ["var(--font-body)", "DM Sans", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
