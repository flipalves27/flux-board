import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, planGateCtxForAuth, PlanGateError } from "@/lib/plan-gates";
import { buildRollingWeekRanges } from "@/lib/flux-reports-metrics";
import { loadOkrProjectionsForBoard } from "@/lib/okr-projection-load";

export async function GET(request: NextRequest) {
  const payload = getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const org = await getOrganizationById(payload.orgId);
    const gateCtx = planGateCtxForAuth(payload.isAdmin);
    try {
      assertFeatureAllowed(org, "okr_engine", gateCtx);
    } catch (err) {
      if (err instanceof PlanGateError) return NextResponse.json({ error: err.message }, { status: err.status });
      throw err;
    }

    const boardId = request.nextUrl.searchParams.get("boardId");
    if (!boardId) return NextResponse.json({ error: "boardId é obrigatório" }, { status: 400 });
    const quarter = request.nextUrl.searchParams.get("quarter");

    const nowMs = Date.now();
    const weeks = buildRollingWeekRanges(4, nowMs);

    const { projections, copilotHistory } = await loadOkrProjectionsForBoard({
      orgId: payload.orgId,
      userId: payload.id,
      isAdmin: payload.isAdmin,
      boardId,
      quarter: quarter || null,
    });

    return NextResponse.json({
      ok: true,
      boardId,
      quarter: quarter || null,
      generatedAt: new Date().toISOString(),
      copilotHistory,
      weeks: weeks.map((w) => ({ label: w.label, startMs: w.startMs, endMs: w.endMs })),
      projections,
    });
  } catch (err) {
    console.error("OKRs projection API error:", err);
    const msg = err instanceof Error ? err.message : "Erro interno";
    const status = msg.includes("Sem permissão") ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
