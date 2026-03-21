import { NextRequest, NextResponse } from "next/server";
import { runGlobalApiRateLimit } from "@/lib/global-api-rate-limit";

export const runtime = "nodejs";

function internalSecret(): string | null {
  return process.env.RATE_LIMIT_INTERNAL_SECRET || process.env.JWT_SECRET || null;
}

export async function POST(req: NextRequest) {
  const secret = internalSecret();
  if (!secret || req.headers.get("x-flux-rate-internal") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    pathname?: string;
    method?: string;
    clientIp?: string;
    authHeader?: string | null;
    cookieHeader?: string | null;
    cronSecret?: string | null;
  } | null;

  const pathname = String(body?.pathname || "");
  if (!pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const result = await runGlobalApiRateLimit({
    pathname,
    method: String(body?.method || "GET"),
    clientIp: String(body?.clientIp || ""),
    authHeader: body?.authHeader ?? null,
    cookieHeader: body?.cookieHeader ?? null,
    cronSecretHeader: body?.cronSecret ?? null,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.message,
        code: "rate_limited",
        category: result.category,
        retryAfterSeconds: result.retryAfterSeconds,
      },
      { status: 429, headers: new Headers(result.headers) }
    );
  }

  return new NextResponse(null, { status: 200, headers: new Headers(result.headers) });
}
