import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /**
   * Preview Vercel ou `ENABLE_PROD_BROWSER_SOURCE_MAPS=1` no Vercel:
   * stack legível no console (aumenta tamanho do build).
   */
  productionBrowserSourceMaps:
    process.env.VERCEL_ENV === "preview" || process.env.ENABLE_PROD_BROWSER_SOURCE_MAPS === "1",
};

const withNextIntl = createNextIntlPlugin();
export default withNextIntl(nextConfig);
