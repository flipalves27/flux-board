import { NextResponse } from "next/server";
import type { PublicApiAuthOk } from "./public-api-auth";
import { slidingRateLimitConsume } from "./sliding-rate-limit";

function envNum(name: string, fallback: number): number {
  const n = Number(process.env[name] ?? "");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export async function enforcePublicApiRateLimit(request: Request, auth: PublicApiAuthOk): Promise<NextResponse | null> {
  const windowMs = envNum("PUBLIC_API_V1_RATE_LIMIT_WINDOW_MS", 60_000);
  const readLimit = envNum("PUBLIC_API_V1_RATE_LIMIT_READ", 240);
  const writeLimit = envNum("PUBLIC_API_V1_RATE_LIMIT_WRITE", 90);
  const keyRaw = request.headers.get("x-api-key")?.trim() || "env_token";
  const method = request.method.toUpperCase();
  const isWrite = method !== "GET";
  const limit = isWrite ? writeLimit : readLimit;
  const rl = await slidingRateLimitConsume({
    key: `public_api:${auth.orgId}:${keyRaw.slice(0, 12)}:${isWrite ? "write" : "read"}`,
    limit,
    windowMs,
  });
  if (rl.allowed) return null;
  return NextResponse.json(
    {
      error: "Rate limit exceeded.",
      code: "PUBLIC_API_RATE_LIMITED",
      retryAfterSeconds: rl.retryAfterSeconds,
    },
    {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfterSeconds) },
    }
  );
}

