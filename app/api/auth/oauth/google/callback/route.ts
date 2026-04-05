import { Google, OAuth2RequestError } from "arctic";
import { NextRequest, NextResponse } from "next/server";

import { assertOAuthRequestHostAllowed } from "@/lib/oauth/allowed-public-origins";
import { completeOAuthSignIn } from "@/lib/oauth/complete-sign-in";
import { getOAuthCallbackRequestOrigin, getOAuthPublicBaseUrl, googleRedirectUri } from "@/lib/oauth/base-url";
import { OAUTH_COOKIE_GOOGLE } from "@/lib/oauth/constants";
import { clearOAuthCookie, parseOAuthStartCookie } from "@/lib/oauth/cookie";
import { buildOAuthSessionLandingResponse } from "@/lib/oauth/session-landing-response";
import { resolveOAuthProfile } from "@/lib/oauth/id-token-profile";
import { redirectToLoginWithOAuthError } from "@/lib/oauth/redirect-login";
import { sanitizeOAuthReturnPath } from "@/lib/oauth/safe-redirect";

export async function GET(req: NextRequest) {
  const clientId = process.env.AUTH_GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.AUTH_GOOGLE_CLIENT_SECRET?.trim();
  const oauthActive = !!(clientId && clientSecret);
  const hostDenied = assertOAuthRequestHostAllowed(req, oauthActive);
  if (hostDenied) {
    clearOAuthCookie(hostDenied, OAUTH_COOKIE_GOOGLE);
    return hostDenied;
  }

  const base = getOAuthPublicBaseUrl(req);

  const rawCookie = req.cookies.get(OAUTH_COOKIE_GOOGLE)?.value;
  if (!rawCookie) {
    const reqHost =
      req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.headers.get("host") || "unknown";
    const ua = req.headers.get("user-agent")?.slice(0, 160);
    console.warn("[oauth-google-callback] Cookie de start OAuth não encontrado", {
      host: reqHost,
      allCookies: req.cookies.getAll().map((c) => c.name),
      referer: req.headers.get("referer")?.slice(0, 120),
      ...(ua ? { userAgent: ua } : {}),
    });
  }
  const payload = parseOAuthStartCookie(rawCookie);
  const locale = payload?.locale ?? "pt-BR";

  const finish = (res: NextResponse) => {
    clearOAuthCookie(res, OAUTH_COOKIE_GOOGLE);
    return res;
  };

  if (!clientId || !clientSecret) {
    return finish(redirectToLoginWithOAuthError(req, locale, "oauth_not_configured", payload?.redirect));
  }

  if (req.nextUrl.searchParams.get("error")) {
    return finish(redirectToLoginWithOAuthError(req, locale, "oauth_denied", payload?.redirect));
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state) {
    return finish(redirectToLoginWithOAuthError(req, locale, "oauth_invalid", payload?.redirect));
  }

  if (!payload || payload.state !== state) {
    return finish(redirectToLoginWithOAuthError(req, locale, "oauth_state", payload?.redirect));
  }

  const redirectUri = googleRedirectUri(base);
  const google = new Google(clientId, clientSecret, redirectUri);

  try {
    const tokens = await google.validateAuthorizationCode(code, payload.codeVerifier);
    const profile = await resolveOAuthProfile("google", tokens);
    if (!profile) {
      return finish(redirectToLoginWithOAuthError(req, payload.locale, "oauth_profile", payload.redirect));
    }

    const result = await completeOAuthSignIn({
      provider: "google",
      subject: profile.sub,
      email: profile.email,
      name: profile.name,
      emailVerified: profile.emailVerified,
      invite: payload.invite,
      redirect: sanitizeOAuthReturnPath(payload.redirect),
      locale: payload.locale,
    });

    if (result.ok) {
      const afterLoginOrigin = getOAuthCallbackRequestOrigin(req);
      const targetUrl = new URL(result.path, afterLoginOrigin).toString();
      return finish(
        buildOAuthSessionLandingResponse({
          targetUrl,
          accessToken: result.access,
          refreshPlain: result.refreshPlain,
          remember: true,
          oauthCookieName: OAUTH_COOKIE_GOOGLE,
        })
      );
    }
    return finish(redirectToLoginWithOAuthError(req, payload.locale, result.error, payload.redirect));
  } catch (e) {
    if (e instanceof OAuth2RequestError) {
      return finish(redirectToLoginWithOAuthError(req, payload.locale, "oauth_exchange", payload.redirect));
    }
    throw e;
  }
}
