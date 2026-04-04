import "server-only";

import { NextResponse } from "next/server";

import { clearOAuthCookie } from "@/lib/oauth/cookie";
import { setAuthCookiesOnNextResponse } from "@/lib/session-cookies";

function escapeHtmlAttribute(url: string): string {
  return url.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * Resposta HTML 200 que aplica cookies de sessão e limpa o cookie OAuth na mesma resposta,
 * depois redireciona via script — evita corrida em que o cliente navega antes de persistir cookies.
 */
export function buildOAuthSessionLandingResponse(args: {
  targetUrl: string;
  accessToken: string;
  refreshPlain: string;
  remember: boolean;
  oauthCookieName: string;
}): NextResponse {
  const { targetUrl, accessToken, refreshPlain, remember, oauthCookieName } = args;
  const urlJson = JSON.stringify(targetUrl);
  const href = escapeHtmlAttribute(targetUrl);
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Redirecting…</title></head><body><p>Redirecting…</p><noscript><a href="${href}">Continue</a></noscript><script>window.location.replace(${urlJson});</script></body></html>`;

  const res = new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
  setAuthCookiesOnNextResponse(res, accessToken, refreshPlain, remember);
  clearOAuthCookie(res, oauthCookieName);
  return res;
}
