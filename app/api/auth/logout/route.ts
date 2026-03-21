import { NextRequest, NextResponse } from "next/server";
import { REFRESH_COOKIE } from "@/lib/auth-cookie-names";
import { revokeRefreshToken } from "@/lib/kv-refresh-sessions";
import { clearAuthCookiesOnNextResponse } from "@/lib/session-cookies";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;
  if (refresh) {
    await revokeRefreshToken(refresh);
  }
  const res = NextResponse.json({ ok: true });
  clearAuthCookiesOnNextResponse(res);
  return res;
}
