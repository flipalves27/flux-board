import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoardIds, getBoardSummariesByIds } from "@/lib/kv-boards";
import { listSprints } from "@/lib/kv-sprints";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, planGateCtxFromAuthPayload, PlanGateError } from "@/lib/plan-gates";
import { denyPlan } from "@/lib/api-authz";
import { countActiveSprints, mergeSprintsWithBoardMeta } from "@/lib/sprints-org-overview";
import { logFluxApiPhase } from "@/lib/flux-api-phase-log";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const route = "GET /api/sprints";
  const t0 = Date.now();
  const payload = await getAuthFromRequest(request);
  logFluxApiPhase(route, "getAuthFromRequest", t0);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const tOrg = Date.now();
  const org = await getOrganizationById(payload.orgId);
  logFluxApiPhase(route, "getOrganizationById", tOrg);
  const gateCtx = planGateCtxFromAuthPayload(payload);
  try {
    assertFeatureAllowed(org, "sprint_engine", gateCtx);
  } catch (err) {
    if (err instanceof PlanGateError) return denyPlan(err);
    return NextResponse.json({ error: "Recurso disponível em planos pagos." }, { status: 403 });
  }

  const summaryOnly = request.nextUrl.searchParams.get("summary") === "1";
  const tIds = Date.now();
  const boardIds = await getBoardIds(payload.id, payload.orgId, payload.isAdmin);
  logFluxApiPhase(route, "getBoardIds", tIds);
  const tSum = Date.now();
  const boards = await getBoardSummariesByIds(boardIds, payload.orgId);
  logFluxApiPhase(route, "getBoardSummariesByIds", tSum);

  const tSprint = Date.now();
  const sprintLists = await Promise.all(boards.map((b) => listSprints(payload.orgId, b.id)));
  logFluxApiPhase(route, "listSprints(all boards parallel)", tSprint);
  const sprintsPerBoard = new Map<string, Awaited<ReturnType<typeof listSprints>>>();
  boards.forEach((b, i) => sprintsPerBoard.set(b.id, sprintLists[i] ?? []));

  if (summaryOnly) {
    let activeSprintCount = 0;
    for (const list of sprintsPerBoard.values()) {
      activeSprintCount += countActiveSprints(list);
    }
    logFluxApiPhase(route, "total", t0);
    return NextResponse.json({ activeSprintCount });
  }

  const sprints = mergeSprintsWithBoardMeta(
    boards.map((b) => ({ id: b.id, name: b.name, boardMethodology: b.boardMethodology })),
    sprintsPerBoard
  );
  const activeSprintCount = countActiveSprints(sprints);

  const boardSummaries = boards.map((b) => ({
    id: b.id,
    name: b.name,
    boardMethodology: b.boardMethodology,
  }));

  logFluxApiPhase(route, "total", t0);
  return NextResponse.json({ sprints, activeSprintCount, boards: boardSummaries });
}
