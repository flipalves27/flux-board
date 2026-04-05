import { NextRequest, NextResponse } from "next/server";
import { REFRESH_COOKIE } from "@/lib/auth-cookie-names";
import { rotateSessionFromRefreshPlain } from "@/lib/server-session";
import { clearAuthCookiesOnNextResponse, setAuthCookiesOnNextResponse } from "@/lib/session-cookies";
import { getClientIpFromHeaders, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const ip = getClientIpFromHeaders(request.headers);
  const rl = await rateLimit({
    key: `auth-refresh:ip:${ip}`,
    limit: Number(process.env.FLUX_RL_AUTH_REFRESH_PER_MIN || 30),
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas de renovação de sessão.", code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!refresh) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const rotated = await rotateSessionFromRefreshPlain(refresh);
  if (!rotated.ok) {
    const res = NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
    if (rotated.clearCookies) clearAuthCookiesOnNextResponse(res);
    return res;
  }

  const res = NextResponse.json({ ok: true });
  setAuthCookiesOnNextResponse(res, rotated.access, rotated.refreshPlain, rotated.persistent);
  return res;
}
