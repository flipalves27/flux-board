import { MicrosoftEntraId, OAuth2RequestError } from "arctic";
import { NextRequest, NextResponse } from "next/server";

import { assertOAuthRequestHostAllowed } from "@/lib/oauth/allowed-public-origins";
import { completeOAuthSignIn } from "@/lib/oauth/complete-sign-in";
import { getOAuthCallbackRequestOrigin, getOAuthPublicBaseUrl, microsoftRedirectUri } from "@/lib/oauth/base-url";
import { OAUTH_COOKIE_MICROSOFT } from "@/lib/oauth/constants";
import { clearOAuthCookie, parseOAuthStartCookie } from "@/lib/oauth/cookie";
import { buildOAuthSessionLandingResponse } from "@/lib/oauth/session-landing-response";
import { resolveOAuthProfile } from "@/lib/oauth/id-token-profile";
import { redirectToLoginWithOAuthError } from "@/lib/oauth/redirect-login";
import { sanitizeOAuthReturnPath } from "@/lib/oauth/safe-redirect";

export async function GET(req: NextRequest) {
  const clientId = process.env.AUTH_MICROSOFT_CLIENT_ID?.trim();
  const clientSecret = process.env.AUTH_MICROSOFT_CLIENT_SECRET?.trim();
  const oauthActive = !!(clientId && clientSecret);
  const hostDenied = assertOAuthRequestHostAllowed(req, oauthActive);
  if (hostDenied) {
    clearOAuthCookie(hostDenied, OAUTH_COOKIE_MICROSOFT);
    return hostDenied;
  }

  const base = getOAuthPublicBaseUrl(req);

  const rawCookie = req.cookies.get(OAUTH_COOKIE_MICROSOFT)?.value;
  const payload = parseOAuthStartCookie(rawCookie);
  const locale = payload?.locale ?? "pt-BR";

  const finish = (res: NextResponse) => {
    clearOAuthCookie(res, OAUTH_COOKIE_MICROSOFT);
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

  const redirectUri = microsoftRedirectUri(base);
  const tenant = process.env.AUTH_MICROSOFT_TENANT_ID?.trim() || "common";
  const entra = new MicrosoftEntraId(tenant, clientId, clientSecret, redirectUri);

  try {
    const tokens = await entra.validateAuthorizationCode(code, payload.codeVerifier);
    const profile = await resolveOAuthProfile("microsoft", tokens);
    if (!profile) {
      return finish(redirectToLoginWithOAuthError(req, payload.locale, "oauth_profile", payload.redirect));
    }

    const result = await completeOAuthSignIn({
      provider: "microsoft",
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
          oauthCookieName: OAUTH_COOKIE_MICROSOFT,
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
