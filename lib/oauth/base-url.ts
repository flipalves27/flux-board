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

/**
 * Origem do pedido atual (callback OAuth). Usar no redirect pós-login: os cookies httpOnly
 * ficam no **host desta resposta**; se `Location` apontar para outro host (ex.: apex vs www)
 * por causa de NEXT_PUBLIC_APP_URL, o browser não envia sessão e o utilizador cai no login.
 */
export function getOAuthCallbackRequestOrigin(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.headers.get("host");
  const rawProto =
    req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    (req.nextUrl.protocol === "https:" ? "https" : "http");
  const proto = rawProto === "https" || rawProto === "http" ? rawProto : "https";
  if (host) return `${proto}://${host}`;
  return req.nextUrl.origin;
}

export function googleRedirectUri(base: string): string {
  return `${base}/api/auth/oauth/google/callback`;
}

export function microsoftRedirectUri(base: string): string {
  return `${base}/api/auth/oauth/microsoft/callback`;
}
