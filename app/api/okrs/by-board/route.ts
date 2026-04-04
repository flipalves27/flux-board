import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, planGateCtxFromAuthPayload, PlanGateError } from "@/lib/plan-gates";
import { denyPlan } from "@/lib/api-authz";
import { userCanAccessBoard } from "@/lib/kv-boards";
import { getObjectivesAndKeyResultsByBoard } from "@/lib/kv-okrs";

export async function GET(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const org = await getOrganizationById(payload.orgId);
    const gateCtx = planGateCtxFromAuthPayload(payload);
    try {
      assertFeatureAllowed(org, "okr_engine", gateCtx);
    } catch (err) {
      if (err instanceof PlanGateError) return denyPlan(err);
      throw err;
    }

    const boardId = request.nextUrl.searchParams.get("boardId");
    if (!boardId) return NextResponse.json({ error: "boardId é obrigatório" }, { status: 400 });
    const quarter = request.nextUrl.searchParams.get("quarter");

    const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
    if (!canAccess) return NextResponse.json({ error: "Sem permissão para este board" }, { status: 403 });

    const grouped = await getObjectivesAndKeyResultsByBoard({
      orgId: payload.orgId,
      boardId,
      quarter: quarter || null,
    });

    return NextResponse.json({
      ok: true,
      boardId,
      quarter: quarter || null,
      objectives: grouped.map((g) => ({
        objective: g.objective,
        keyResults: g.keyResults,
      })),
    });
  } catch (err) {
    console.error("OKRs by-board API error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro interno" }, { status: 500 });
  }
}

