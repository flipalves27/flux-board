import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ensurePlatformAdmin } from "@/lib/api-authz";
import { aggregateRateLimitAbuse } from "@/lib/rate-limit-abuse";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const payload = await getAuthFromRequest(req);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const denied = ensurePlatformAdmin(payload);
  if (denied) return denied;

  const daysRaw = Number(req.nextUrl.searchParams.get("days") ?? 7);
  const days = Number.isFinite(daysRaw) ? Math.min(30, Math.max(1, daysRaw)) : 7;
  const sinceMs = days * 24 * 60 * 60 * 1000;

  const rows = await aggregateRateLimitAbuse({ sinceMs, limit: 100 });
  return NextResponse.json({ rows, days });
}
