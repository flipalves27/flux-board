import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth-cookie-names";
import { validateSessionFromCookieValues } from "@/lib/server-session";
import { clearAuthCookiesOnNextResponse, setAuthCookiesOnNextResponse } from "@/lib/session-cookies";
import { getClientIpFromHeaders, rateLimitMemoryOnly } from "@/lib/rate-limit";
export const runtime = "nodejs";
/** Isolado do POST de RSC/Server Actions — evita competir pelo mesmo timeout ao abrir /boards após OAuth. */
export const maxDuration = 60;

/** Teto abaixo de `maxDuration` e do `socketTimeoutMS` do Mongo — evita 504 “Task timed out after 60 seconds” sem JSON. */
function sessionValidateWallMs(): number {
  const raw = process.env.FLUX_SESSION_VALIDATE_WALL_MS?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 5_000 && n <= 55_000) return Math.floor(n);
  }
  return 25_000;
}

function withWall<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(label)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

/**
 * Valida sessão (cookies httpOnly) sem Server Action.
 * Sempre 200 + JSON `ValidateResult` para o cliente tratar `ok`; `Cache-Control: no-store`.
 */
export async function GET(request: NextRequest) {
  const ip = getClientIpFromHeaders(request.headers);
  const rl = await rateLimitMemoryOnly({
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

  const wallMs = sessionValidateWallMs();
  try {
    const { result, sideEffect } = await withWall(
      validateSessionFromCookieValues(access, refresh, {
        requestHostForDebug,
      }),
      wallMs,
      "session_validate_wall_timeout"
    );
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
    const msg = e instanceof Error ? e.message : "";
    if (msg === "session_validate_wall_timeout") {
      const supportRef = randomUUID();
      console.error("[api/auth/session] validate wall timeout", { supportRef, wallMs });
      return NextResponse.json(
        { ok: false, supportRef, failureKind: "server_timeout" as const },
        { status: 200, headers: { "Cache-Control": "no-store, private" } }
      );
    }
    const supportRef = randomUUID();
    console.error("[api/auth/session]", e);
    return NextResponse.json(
      { ok: false, supportRef, failureKind: "unknown" as const },
      { status: 200, headers: { "Cache-Control": "no-store, private" } }
    );
  }
}
