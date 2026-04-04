import { MicrosoftEntraId, OAuth2RequestError } from "arctic";
import { NextRequest, NextResponse } from "next/server";

import { completeOAuthSignIn } from "@/lib/oauth/complete-sign-in";
import { getOAuthPublicBaseUrl, microsoftRedirectUri } from "@/lib/oauth/base-url";
import { OAUTH_COOKIE_MICROSOFT } from "@/lib/oauth/constants";
import { clearOAuthCookie, parseOAuthStartCookie } from "@/lib/oauth/cookie";
import { resolveOAuthProfile } from "@/lib/oauth/id-token-profile";
import { redirectToLoginWithOAuthError } from "@/lib/oauth/redirect-login";
import { setAuthCookiesOnNextResponse } from "@/lib/session-cookies";

export async function GET(req: NextRequest) {
  const clientId = process.env.AUTH_MICROSOFT_CLIENT_ID?.trim();
  const clientSecret = process.env.AUTH_MICROSOFT_CLIENT_SECRET?.trim();
  const base = getOAuthPublicBaseUrl(req);

  const rawCookie = req.cookies.get(OAUTH_COOKIE_MICROSOFT)?.value;
  const payload = parseOAuthStartCookie(rawCookie);
  const locale = payload?.locale ?? "pt-BR";

  const finish = (res: NextResponse) => {
    clearOAuthCookie(res, OAUTH_COOKIE_MICROSOFT);
    return res;
  };

  if (!clientId || !clientSecret) {
    return finish(redirectToLoginWithOAuthError(req, locale, "oauth_not_configured"));
  }

  if (req.nextUrl.searchParams.get("error")) {
    return finish(redirectToLoginWithOAuthError(req, locale, "oauth_denied"));
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state) {
    return finish(redirectToLoginWithOAuthError(req, locale, "oauth_invalid"));
  }

  if (!payload || payload.state !== state) {
    return finish(redirectToLoginWithOAuthError(req, locale, "oauth_state"));
  }

  const redirectUri = microsoftRedirectUri(base);
  const tenant = process.env.AUTH_MICROSOFT_TENANT_ID?.trim() || "common";
  const entra = new MicrosoftEntraId(tenant, clientId, clientSecret, redirectUri);

  try {
    const tokens = await entra.validateAuthorizationCode(code, payload.codeVerifier);
    const profile = await resolveOAuthProfile("microsoft", tokens);
    if (!profile) {
      return finish(redirectToLoginWithOAuthError(req, payload.locale, "oauth_profile"));
    }

    const result = await completeOAuthSignIn({
      provider: "microsoft",
      subject: profile.sub,
      email: profile.email,
      name: profile.name,
      emailVerified: profile.emailVerified,
      invite: payload.invite,
      redirect: payload.redirect,
      locale: payload.locale,
    });

    if (result.ok) {
      const res = NextResponse.redirect(new URL(result.path, base).toString(), 302);
      setAuthCookiesOnNextResponse(res, result.access, result.refreshPlain, true);
      return finish(res);
    }
    return finish(redirectToLoginWithOAuthError(req, payload.locale, result.error));
  } catch (e) {
    if (e instanceof OAuth2RequestError) {
      return finish(redirectToLoginWithOAuthError(req, payload.locale, "oauth_exchange"));
    }
    throw e;
  }
}
