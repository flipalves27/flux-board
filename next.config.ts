import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /** Preview Vercel: source maps no browser para depurar stack (aumenta tamanho do build). */
  productionBrowserSourceMaps: process.env.VERCEL_ENV === "preview",
};

const withNextIntl = createNextIntlPlugin();
export default withNextIntl(nextConfig);
