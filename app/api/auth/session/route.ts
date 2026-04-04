import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth-cookie-names";
import { validateSessionFromCookieValues } from "@/lib/server-session";
import { clearAuthCookiesOnNextResponse, setAuthCookiesOnNextResponse } from "@/lib/session-cookies";
import { getClientIpFromHeaders, rateLimit } from "@/lib/rate-limit";
export const runtime = "nodejs";
/** Isolado do POST de RSC/Server Actions — evita competir pelo mesmo timeout ao abrir /boards após OAuth. */
export const maxDuration = 60;

/**
 * Valida sessão (cookies httpOnly) sem Server Action.
 * Sempre 200 + JSON `ValidateResult` para o cliente tratar `ok`; `Cache-Control: no-store`.
 */
export async function GET(request: NextRequest) {
  const ip = getClientIpFromHeaders(request.headers);
  const rl = await rateLimit({
    key: `auth-session:ip:${ip}`,
    limit: Number(process.env.FLUX_RL_AUTH_SESSION_PER_MIN || 90),
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, failureKind: "unknown" as const },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds), "Cache-Control": "no-store" } }
    );
  }

  const access = request.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;
  const requestHostForDebug =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host") ||
    undefined;

  try {
    const { result, sideEffect } = await validateSessionFromCookieValues(access, refresh, {
      requestHostForDebug,
    });
    const res = NextResponse.json(result, {
      status: 200,
      headers: { "Cache-Control": "no-store, private" },
    });
    if (sideEffect?.type === "set_rotated") {
      setAuthCookiesOnNextResponse(res, sideEffect.access, sideEffect.refreshPlain, sideEffect.persistent);
    } else if (sideEffect?.type === "clear_all") {
      clearAuthCookiesOnNextResponse(res);
    }
    return res;
  } catch (e) {
    console.error("[api/auth/session]", e);
    return NextResponse.json(
      { ok: false, failureKind: "unknown" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
