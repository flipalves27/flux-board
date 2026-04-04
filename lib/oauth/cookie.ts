import type { NextResponse } from "next/server";

import type { OAuthStartPayload } from "./constants";

const COOKIE_BASE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 600,
};

export function setOAuthStartCookie(res: NextResponse, name: string, payload: OAuthStartPayload): void {
  res.cookies.set(name, JSON.stringify(payload), COOKIE_BASE);
}

export function clearOAuthCookie(res: NextResponse, name: string): void {
  res.cookies.set(name, "", { ...COOKIE_BASE, maxAge: 0 });
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
