import "server-only";

import { NextResponse } from "next/server";

import { canonicalizeOAuthSessionLandingUrl } from "@/lib/oauth/canonicalize-oauth-landing-url";
import { clearOAuthCookie } from "@/lib/oauth/cookie";
import { isFluxAuthDebugEnabled, logFluxAuthDebug } from "@/lib/flux-auth-debug";
import { setAuthCookiesOnNextResponse } from "@/lib/session-cookies";

function canonicalizeTargetUrl(targetUrl: string): string {
  return canonicalizeOAuthSessionLandingUrl(targetUrl, {
    nextPublicAppUrl: process.env.NEXT_PUBLIC_APP_URL,
    authCookieDomain: process.env.AUTH_COOKIE_DOMAIN,
  });
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
  if (isFluxAuthDebugEnabled()) {
    try {
      const fromParsed = new URL(targetUrl);
      const toParsed = new URL(finalUrl);
      if (fromParsed.hostname !== toParsed.hostname) {
        let nextPublicAppHost: string | undefined;
        const raw = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
        if (raw) {
          try {
            nextPublicAppHost = new URL(raw).hostname;
          } catch {
            /* ignore */
          }
        }
        logFluxAuthDebug("oauth_landing_host_rewritten", {
          fromHost: fromParsed.hostname,
          toHost: toParsed.hostname,
          path: fromParsed.pathname,
          nextPublicAppHost,
          authCookieDomainSet: Boolean(process.env.AUTH_COOKIE_DOMAIN?.trim()),
        });
      }
    } catch {
      /* ignore malformed URLs */
    }
  }
  const res = NextResponse.redirect(finalUrl, 303);
  res.headers.set("Cache-Control", "no-store");
  setAuthCookiesOnNextResponse(res, accessToken, refreshPlain, remember);
  clearOAuthCookie(res, oauthCookieName);
  return res;
}
