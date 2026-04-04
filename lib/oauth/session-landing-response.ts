import "server-only";

import { NextResponse } from "next/server";

import { clearOAuthCookie } from "@/lib/oauth/cookie";
import { setAuthCookiesOnNextResponse } from "@/lib/session-cookies";

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
  const res = NextResponse.redirect(targetUrl, 303);
  res.headers.set("Cache-Control", "no-store");
  setAuthCookiesOnNextResponse(res, accessToken, refreshPlain, remember);
  clearOAuthCookie(res, oauthCookieName);
  return res;
}
