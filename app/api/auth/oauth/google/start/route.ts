import { Google, generateCodeVerifier, generateState } from "arctic";
import { NextRequest, NextResponse } from "next/server";

import { getClientIpFromHeaders, rateLimit } from "@/lib/rate-limit";
import { assertOAuthRequestHostAllowed } from "@/lib/oauth/allowed-public-origins";
import { getOAuthPublicBaseUrl, googleRedirectUri } from "@/lib/oauth/base-url";
import { OAUTH_COOKIE_GOOGLE, OAUTH_SCOPES } from "@/lib/oauth/constants";
import { setOAuthStartCookie } from "@/lib/oauth/cookie";
import { sanitizeOAuthReturnPath } from "@/lib/oauth/safe-redirect";

export async function GET(req: NextRequest) {
  const clientId = process.env.AUTH_GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.AUTH_GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "oauth_not_configured" }, { status: 503 });
  }

  const hostDenied = assertOAuthRequestHostAllowed(req, true);
  if (hostDenied) return hostDenied;

  const clientIp = getClientIpFromHeaders(req.headers);
  const rl = await rateLimit({
    key: `auth:oauth:google:start:ip:${clientIp}`,
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const base = getOAuthPublicBaseUrl(req);
  const redirectUri = googleRedirectUri(base);
  const google = new Google(clientId, clientSecret, redirectUri);

  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const invite = req.nextUrl.searchParams.get("invite") ?? undefined;
  const redirect = sanitizeOAuthReturnPath(req.nextUrl.searchParams.get("redirect") ?? undefined);
  const locale = req.nextUrl.searchParams.get("locale") ?? "pt-BR";

  const url = google.createAuthorizationURL(state, codeVerifier, [...OAUTH_SCOPES]);

  const res = NextResponse.redirect(url.toString(), 302);
  setOAuthStartCookie(res, OAUTH_COOKIE_GOOGLE, {
    state,
    codeVerifier,
    invite,
    redirect,
    locale,
  });
  return res;
}
