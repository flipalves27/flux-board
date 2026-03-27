import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ensureAdminUser } from "@/lib/kv-users";
import { listBoardsForUser } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, canUseFeature, planGateCtxForAuth, PlanGateError } from "@/lib/plan-gates";
import { denyPlan } from "@/lib/api-authz";
import { buildFluxReportsLssPayload, filterLeanSixSigmaBoards, type FluxReportsLssPayload } from "@/lib/flux-reports-lss";
import { listObjectivesWithKeyResults } from "@/lib/kv-okrs";
import { currentQuarterLabel } from "@/lib/quarter-label";

/**
 * Relatório executivo Lean Six Sigma (DMAIC) — org-wide, boards com `boardMethodology === lean_six_sigma`.
 * Plano Business+ (`lss_executive_reports`).
 */
export async function GET(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    await ensureAdminUser();
    const org = await getOrganizationById(payload.orgId);
    const gateCtx = planGateCtxForAuth(payload.isAdmin, payload.isExecutive);
    try {
      assertFeatureAllowed(org, "lss_executive_reports", gateCtx);
    } catch (err) {
      if (err instanceof PlanGateError) return denyPlan(err);
      throw err;
    }

    const boards = await listBoardsForUser(payload.id, payload.orgId, payload.isAdmin);
    const lssBoards = filterLeanSixSigmaBoards(boards);
    const lssIds = new Set(lssBoards.map((b) => b.id));

    let okrHints: FluxReportsLssPayload["okrHints"];
    const okrEnabled = canUseFeature(org, "okr_engine", gateCtx);
    if (okrEnabled && lssIds.size > 0) {
      const grouped = await listObjectivesWithKeyResults(payload.orgId, currentQuarterLabel());
      const hints: NonNullable<typeof okrHints> = [];
      for (const { objective, keyResults } of grouped) {
        for (const kr of keyResults) {
          if (lssIds.has(kr.linkedBoardId)) {
            hints.push({
              objectiveId: objective.id,
              objectiveTitle: objective.title,
              krTitle: kr.title,
              boardId: kr.linkedBoardId,
            });
          }
        }
      }
      okrHints = hints.length ? hints.slice(0, 24) : undefined;
    }

    const body = buildFluxReportsLssPayload(boards, { okrHints });

    return NextResponse.json(body, {
      headers: {
        "Cache-Control": "private, max-age=120, stale-while-revalidate=60",
      },
    });
  } catch (err) {
    console.error("Flux reports LSS API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    );
  }
}
