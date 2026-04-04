import "server-only";

import { NextResponse } from "next/server";

import { clearOAuthCookie } from "@/lib/oauth/cookie";
import { setAuthCookiesOnNextResponse } from "@/lib/session-cookies";

/**
 * Garante que a URL de destino use o host canônico (NEXT_PUBLIC_APP_URL).
 * Evita que cookies de sessão fiquem em um host diferente do que o browser vai acessar.
 */
function canonicalizeTargetUrl(targetUrl: string): string {
  const canonical = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (!canonical) return targetUrl;
  try {
    const target = new URL(targetUrl);
    const canon = new URL(canonical);
    if (target.hostname !== canon.hostname) {
      target.hostname = canon.hostname;
      target.protocol = canon.protocol;
      return target.toString();
    }
  } catch {
    /* manter URL original */
  }
  return targetUrl;
}

/**
 * Redirecionamento HTTP com `Set-Cookie` na mesma resposta (padrão OAuth).
 * O browser aplica os cookies antes de seguir `Location`, o que evita corrida com
 * `window.location` em HTML estático e garante que a página seguinte já envie a sessão.
 */
export function buildOAuthSessionLandingResponse(args: {
  targetUrl: string;
  accessToken: string;
  refreshPlain: string;
  remember: boolean;
  oauthCookieName: string;
}): NextResponse {
  const { targetUrl, accessToken, refreshPlain, remember, oauthCookieName } = args;
  const finalUrl = canonicalizeTargetUrl(targetUrl);
  const res = NextResponse.redirect(finalUrl, 303);
  res.headers.set("Cache-Control", "no-store");
  setAuthCookiesOnNextResponse(res, accessToken, refreshPlain, remember);
  clearOAuthCookie(res, oauthCookieName);
  return res;
}
