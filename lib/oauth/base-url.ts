import type { NextRequest } from "next/server";

/** Origin pública derivada dos headers do pedido (proxy-aware). Usada na allowlist OAuth e no `redirect_uri`. */
export function getOAuthRequestPublicOrigin(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.headers.get("host");
  const rawProto =
    req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    (req.nextUrl.protocol === "https:" ? "https" : "http");
  const proto = rawProto === "https" || rawProto === "http" ? rawProto : "https";
  if (host) return `${proto}://${host}`;
  return req.nextUrl.origin;
}

/**
 * Base pública da app (redirect OAuth). `NEXT_PUBLIC_APP_URL` deve coincidir com o host
 * no browser; quando **não** coincide (www vs apex, domínio custom vs `*.vercel.app`),
 * usamos o host deste pedido para o `redirect_uri` — senão o Google devolve a outro host,
 * os cookies de sessão ficam lá e o utilizador volta ao site “sem login”.
 *
 * Registe em Google/Microsoft **todos** os redirect URIs dos hosts que o tráfego usa.
 *
 * Em produção, as rotas OAuth devem chamar antes `assertOAuthRequestHostAllowed` (allowlist
 * `OAUTH_ALLOWED_PUBLIC_ORIGINS`) para não emitir `redirect_uri` com host não registado.
 */
export function getOAuthPublicBaseUrl(req: NextRequest): string {
  const explicitRaw = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  const requestOrigin = getOAuthRequestPublicOrigin(req);
  if (!explicitRaw) return requestOrigin;

  let explicitHost: string;
  try {
    explicitHost = new URL(explicitRaw).hostname.toLowerCase();
  } catch {
    return explicitRaw;
  }

  const reqHost = (() => {
    const h =
      req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.headers.get("host") || "";
    return h.split(":")[0]!.toLowerCase();
  })();

  if (reqHost && explicitHost === reqHost) return explicitRaw;
  if (reqHost) return requestOrigin;
  return explicitRaw;
}

/**
 * Origem do pedido atual (callback OAuth). Usar no redirect pós-login: os cookies httpOnly
 * ficam no **host desta resposta**; se `Location` apontar para outro host (ex.: apex vs www)
 * por causa de NEXT_PUBLIC_APP_URL, o browser não envia sessão e o utilizador cai no login.
 */
export function getOAuthCallbackRequestOrigin(req: NextRequest): string {
  return getOAuthRequestPublicOrigin(req);
}

export function googleRedirectUri(base: string): string {
  return `${base}/api/auth/oauth/google/callback`;
}

export function microsoftRedirectUri(base: string): string {
  return `${base}/api/auth/oauth/microsoft/callback`;
}
