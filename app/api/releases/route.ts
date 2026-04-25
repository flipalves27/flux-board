import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoardIds, getBoardSummariesByIds } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import { listReleases } from "@/lib/kv-releases";
import { listSprints } from "@/lib/kv-sprints";
import { assertFeatureAllowed, planGateCtxFromAuthPayload, PlanGateError } from "@/lib/plan-gates";
import { denyPlan } from "@/lib/api-authz";
import { countUpcomingReleases, mergeReleasesWithBoardMeta } from "@/lib/releases-org-overview";
import { logFluxApiPhase } from "@/lib/flux-api-phase-log";
import type { ReleaseData } from "@/lib/schemas";
import type { SprintData } from "@/lib/schemas";

export const runtime = "nodejs";

function sprintNameMap(sprints: SprintData[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const s of sprints) {
    m.set(s.id, s.name);
  }
  return m;
}

export async function GET(request: NextRequest) {
  const route = "GET /api/releases";
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

  const tReleases = Date.now();
  const [releaseLists, sprintLists] = await Promise.all([
    Promise.all(boards.map((b) => listReleases(payload.orgId, b.id))),
    Promise.all(boards.map((b) => listSprints(payload.orgId, b.id))),
  ]);
  logFluxApiPhase(route, "listReleases+listSprints (parallel per board)", tReleases);

  const releasesPerBoard = new Map<string, ReleaseData[]>();
  const sprintNameByBoard = new Map<string, Map<string, string>>();
  boards.forEach((b, i) => {
    releasesPerBoard.set(b.id, releaseLists[i] ?? []);
    sprintNameByBoard.set(b.id, sprintNameMap(sprintLists[i] ?? []));
  });

  const flatReleases: ReleaseData[] = [];
  for (const list of releaseLists) {
    for (const r of list) flatReleases.push(r);
  }

  if (summaryOnly) {
    const upcomingReleaseCount = countUpcomingReleases(flatReleases);
    logFluxApiPhase(route, "total", t0);
    return NextResponse.json({ upcomingReleaseCount });
  }

  const releases = mergeReleasesWithBoardMeta(
    boards.map((b) => ({ id: b.id, name: b.name, boardMethodology: b.boardMethodology })),
    releasesPerBoard,
    sprintNameByBoard
  );
  const upcomingReleaseCount = countUpcomingReleases(flatReleases);

  const boardSummaries = boards.map((b) => ({
    id: b.id,
    name: b.name,
    boardMethodology: b.boardMethodology,
  }));

  logFluxApiPhase(route, "total", t0);
  return NextResponse.json({ releases, upcomingReleaseCount, boards: boardSummaries });
}
