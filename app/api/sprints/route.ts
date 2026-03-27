import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { listBoardsForUser } from "@/lib/kv-boards";
import { listSprints } from "@/lib/kv-sprints";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, planGateCtxForAuth, PlanGateError } from "@/lib/plan-gates";
import { denyPlan } from "@/lib/api-authz";
import { countActiveSprints, mergeSprintsWithBoardMeta } from "@/lib/sprints-org-overview";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const org = await getOrganizationById(payload.orgId);
  const gateCtx = planGateCtxForAuth(payload.isAdmin, payload.isExecutive);
  try {
    assertFeatureAllowed(org, "sprint_engine", gateCtx);
  } catch (err) {
    if (err instanceof PlanGateError) return denyPlan(err);
    return NextResponse.json({ error: "Recurso disponível em planos pagos." }, { status: 403 });
  }

  const summaryOnly = request.nextUrl.searchParams.get("summary") === "1";
  const boards = await listBoardsForUser(payload.id, payload.orgId, payload.isAdmin);
  const sprintsPerBoard = new Map<string, Awaited<ReturnType<typeof listSprints>>>();
  for (const b of boards) {
    sprintsPerBoard.set(b.id, await listSprints(payload.orgId, b.id));
  }

  if (summaryOnly) {
    let activeSprintCount = 0;
    for (const list of sprintsPerBoard.values()) {
      activeSprintCount += countActiveSprints(list);
    }
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

  return NextResponse.json({ sprints, activeSprintCount, boards: boardSummaries });
}
