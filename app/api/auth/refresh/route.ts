import { NextRequest, NextResponse } from "next/server";
import { REFRESH_COOKIE } from "@/lib/auth-cookie-names";
import { rotateSessionFromRefreshPlain } from "@/lib/server-session";
import { setAuthCookiesOnNextResponse } from "@/lib/session-cookies";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!refresh) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const rotated = await rotateSessionFromRefreshPlain(refresh);
  if (!rotated) {
    const res = NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
    return res;
  }

  const res = NextResponse.json({ ok: true });
  setAuthCookiesOnNextResponse(res, rotated.access, rotated.refreshPlain, rotated.persistent);
  return res;
}
