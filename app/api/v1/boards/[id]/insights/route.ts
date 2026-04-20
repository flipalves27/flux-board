import { NextRequest, NextResponse } from "next/server";
import { buildFluxIntelligenceInsights } from "@/lib/insights/flux-intelligence";
import { getBoard } from "@/lib/kv-boards";
import { isInnovationFlagEnabled } from "@/lib/feature-flags";
import { getOrganizationById } from "@/lib/kv-organizations";
import { getActiveSprint } from "@/lib/kv-sprints";
import { resolveOrgFromV1ApiKey } from "@/lib/org-api-keys";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  const apiKey = request.headers.get("x-api-key");
  const resolved = await resolveOrgFromV1ApiKey(apiKey);
  if (!resolved) {
    return NextResponse.json({ error: "API key required or invalid" }, { status: 401 });
  }

  const org = await getOrganizationById(resolved.orgId);
  if (!isInnovationFlagEnabled("insights_api", org)) {
    return NextResponse.json({ error: "Flux Insights API requires Business tier and feature access." }, { status: 403 });
  }

  const { id: boardId } = await params;
  const board = await getBoard(boardId, resolved.orgId);
  if (!board || board.orgId !== resolved.orgId) {
    return NextResponse.json({ error: "Board not found" }, { status: 404 });
  }

  const sprint = await getActiveSprint(resolved.orgId, boardId);
  const insights = buildFluxIntelligenceInsights({ board, sprint });

  return NextResponse.json({
    boardId,
    generatedAt: new Date().toISOString(),
    insights,
  });
}
