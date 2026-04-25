import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ensureAdminUser } from "@/lib/kv-users";
import { getBoardIds, getBoardsLssLeanSliceByIds } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, canUseFeature, planGateCtxFromAuthPayload, PlanGateError } from "@/lib/plan-gates";
import { denyPlan } from "@/lib/api-authz";
import { buildFluxReportsLssPayload, type FluxReportsLssPayload } from "@/lib/flux-reports-lss";
import { listObjectivesWithKeyResults } from "@/lib/kv-okrs";
import { currentQuarterLabel } from "@/lib/quarter-label";
import { publicApiErrorResponse } from "@/lib/public-api-error";

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
    const gateCtx = planGateCtxFromAuthPayload(payload);
    try {
      assertFeatureAllowed(org, "lss_executive_reports", gateCtx);
    } catch (err) {
      if (err instanceof PlanGateError) return denyPlan(err);
      throw err;
    }

    const boardIdsLss = await getBoardIds(payload.id, payload.orgId, payload.isAdmin);
    const lssBoards = await getBoardsLssLeanSliceByIds(boardIdsLss, payload.orgId);
    const requestedBoardIds = [
      ...new Set(
        [...request.nextUrl.searchParams.getAll("boardIds"), request.nextUrl.searchParams.get("boardIdsCsv") ?? ""]
          .join(",")
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean)
      ),
    ];
    const filteredBoards =
      requestedBoardIds.length > 0 ? lssBoards.filter((board) => requestedBoardIds.includes(board.id)) : lssBoards;
    const effectiveBoardIds = filteredBoards.map((board) => board.id);
    const lssIds = new Set(filteredBoards.map((b) => b.id));

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

    const body = buildFluxReportsLssPayload(filteredBoards, { okrHints });
    const responseBody = {
      ...body,
      meta: {
        scope: {
          kind: requestedBoardIds.length > 0 ? "boards" : "methodology",
          methodology: "lean_six_sigma",
          boardIds: requestedBoardIds.length > 0 ? effectiveBoardIds : [],
          boardCount: filteredBoards.length,
          labelHint:
            requestedBoardIds.length > 0
              ? `${filteredBoards.length} selected LSS boards`
              : "Methodology: lean_six_sigma",
        },
      },
    };

    return NextResponse.json(responseBody, {
      headers: {
        "Cache-Control": "private, max-age=120, stale-while-revalidate=60",
      },
    });
  } catch (err) {
    console.error("Flux reports LSS API error:", err);
    return publicApiErrorResponse(err, { context: "api/flux-reports/lss/route.ts" });
  }
}
