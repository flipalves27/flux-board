import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /** Evita bundling que quebra pdf.js (workers/cmaps) em Route Handlers — necessário para extração de PDF em produção. */
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
  /**
   * O fake worker do pdf.js faz `import(pdf.worker.mjs)` dinâmico; o file tracing do Next/Vercel
   * não inclui esse ficheiro por defeito → erro em Lambda. Forçar inclusão de todo o pdfjs-dist.
   * O segmento `*` casa com `[id]` no App Router (picomatch).
   */
  outputFileTracingIncludes: {
    "/api/boards/*/spec-plan/stream": ["./node_modules/pdfjs-dist/**/*"],
  },
  /**
   * Preview Vercel ou `ENABLE_PROD_BROWSER_SOURCE_MAPS=1` no Vercel:
   * stack legível no console (aumenta tamanho do build).
   */
  productionBrowserSourceMaps:
    process.env.VERCEL_ENV === "preview" || process.env.ENABLE_PROD_BROWSER_SOURCE_MAPS === "1",
};

const withNextIntl = createNextIntlPlugin();
export default withNextIntl(nextConfig);
