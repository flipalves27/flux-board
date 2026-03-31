import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { listAgentRunsForOrg } from "@/lib/agent-runs";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const url = new URL(request.url);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 20));
  const runs = await listAgentRunsForOrg(payload.orgId, limit);
  return NextResponse.json({ runs });
}
