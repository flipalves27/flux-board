import type { NextRequest } from "next/server";

/**
 * Base pública da app (redirect OAuth). Preferir NEXT_PUBLIC_APP_URL em produção
 * para coincidir com o registrado no Google/Azure.
 */
export function getOAuthPublicBaseUrl(req: NextRequest): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const proto =
    req.headers.get("x-forwarded-proto") || (process.env.NODE_ENV === "production" ? "https" : "http");
  if (host) return `${proto}://${host}`;
  return "http://localhost:3000";
}

export function googleRedirectUri(base: string): string {
  return `${base}/api/auth/oauth/google/callback`;
}

export function microsoftRedirectUri(base: string): string {
  return `${base}/api/auth/oauth/microsoft/callback`;
}
