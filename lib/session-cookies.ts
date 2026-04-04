import "server-only";

import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

import { ACCESS_COOKIE, REFRESH_COOKIE } from "./auth-cookie-names";
import { accessTokenExpiresSeconds, refreshCookieMaxAgeSec } from "./session-ttl";

export { ACCESS_COOKIE, REFRESH_COOKIE };

export function authCookieBase(): {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: string;
} {
  /** Sem `domain` explícito = host-only; correto para a maioria dos deploys. Só defina domínio
   * partilhado se souber o impacto em subdomínios (e alinhe com NEXT_PUBLIC_APP_URL). */
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  };
}

export async function setAuthCookies(accessToken: string, refreshPlain: string, remember: boolean): Promise<void> {
  const store = await cookies();
  const base = authCookieBase();
  const accessMaxAge = accessTokenExpiresSeconds();
  const refreshSec = refreshCookieMaxAgeSec(remember);
  store.set(ACCESS_COOKIE, accessToken, { ...base, maxAge: accessMaxAge });
  store.set(REFRESH_COOKIE, refreshPlain, {
    ...base,
    ...(refreshSec != null ? { maxAge: refreshSec } : {}),
  });
}

export async function clearAuthCookies(): Promise<void> {
  const store = await cookies();
  const base = authCookieBase();
  store.set(ACCESS_COOKIE, "", { ...base, maxAge: 0 });
  store.set(REFRESH_COOKIE, "", { ...base, maxAge: 0 });
}

export function setAuthCookiesOnNextResponse(
  res: NextResponse,
  accessToken: string,
  refreshPlain: string,
  remember: boolean
): void {
  const base = authCookieBase();
  res.cookies.set(ACCESS_COOKIE, accessToken, { ...base, maxAge: accessTokenExpiresSeconds() });
  const refSec = refreshCookieMaxAgeSec(remember);
  res.cookies.set(REFRESH_COOKIE, refreshPlain, {
    ...base,
    ...(refSec != null ? { maxAge: refSec } : {}),
  });
}

export function clearAuthCookiesOnNextResponse(res: NextResponse): void {
  const base = authCookieBase();
  res.cookies.set(ACCESS_COOKIE, "", { ...base, maxAge: 0 });
  res.cookies.set(REFRESH_COOKIE, "", { ...base, maxAge: 0 });
}
