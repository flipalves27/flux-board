import type { NextResponse } from "next/server";

import type { OAuthStartPayload } from "./constants";

function oauthCookieDomainOption(): { domain: string } | Record<string, never> {
  const d = process.env.AUTH_COOKIE_DOMAIN?.trim();
  return d ? { domain: d } : {};
}

const COOKIE_BASE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  /** 15m — margem para cold start; produção deve usar AUTH_COOKIE_DOMAIN + hosts OAuth alinhados. */
  maxAge: 900,
};

function fullCookieOptions() {
  return { ...COOKIE_BASE, ...oauthCookieDomainOption() };
}

export function setOAuthStartCookie(res: NextResponse, name: string, payload: OAuthStartPayload): void {
  res.cookies.set(name, JSON.stringify(payload), fullCookieOptions());
}

export function clearOAuthCookie(res: NextResponse, name: string): void {
  res.cookies.set(name, "", { ...fullCookieOptions(), maxAge: 0 });
}

export function parseOAuthStartCookie(raw: string | undefined): OAuthStartPayload | null {
  if (!raw?.trim()) return null;
  try {
    const p = JSON.parse(raw) as OAuthStartPayload;
    if (
      typeof p.state !== "string" ||
      typeof p.codeVerifier !== "string" ||
      typeof p.locale !== "string"
    ) {
      return null;
    }
    return p;
  } catch {
    return null;
  }
}
