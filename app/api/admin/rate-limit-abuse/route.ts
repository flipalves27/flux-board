import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { aggregateRateLimitAbuse } from "@/lib/rate-limit-abuse";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const payload = getAuthFromRequest(req);
  if (!payload?.isAdmin) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const daysRaw = Number(req.nextUrl.searchParams.get("days") ?? 7);
  const days = Number.isFinite(daysRaw) ? Math.min(30, Math.max(1, daysRaw)) : 7;
  const sinceMs = days * 24 * 60 * 60 * 1000;

  const rows = await aggregateRateLimitAbuse({ sinceMs, limit: 100 });
  return NextResponse.json({ rows, days });
}
