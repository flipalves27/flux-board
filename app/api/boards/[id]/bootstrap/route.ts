import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, updateBoard, userCanAccessExistingBoard } from "@/lib/kv-boards";
import { inferLegacyBoardMethodology, type BoardMethodology } from "@/lib/board-methodology";
import { listSprints } from "@/lib/kv-sprints";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, planGateCtxFromAuthPayload } from "@/lib/plan-gates";
import { stripPortalForClient } from "@/lib/portal-settings";
import { logFluxApiPhase } from "@/lib/flux-api-phase-log";

export const maxDuration = 60;

/**
 * Um round-trip: board + sprints (mesma política de acesso que GET board + GET sprints).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const route = "GET /api/boards/[id]/bootstrap";
  const t0 = Date.now();
  const payload = await getAuthFromRequest(request);
  logFluxApiPhase(route, "getAuthFromRequest", t0);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id: requestedBoardId } = await params;
  if (!requestedBoardId || requestedBoardId === "boards") {
    return NextResponse.json({ error: "ID do board é obrigatório" }, { status: 400 });
  }
  const boardId = requestedBoardId;

  const t1 = Date.now();
  const board = await getBoard(boardId, payload.orgId);
  logFluxApiPhase(route, "getBoard", t1);
  if (!board) {
    return NextResponse.json({ error: "Sem permissão para este board" }, { status: 403 });
  }
  const t1b = Date.now();
  const allowed = await userCanAccessExistingBoard(board, payload.id, payload.orgId, payload.isAdmin);
  logFluxApiPhase(route, "userCanAccessExistingBoard", t1b);
  if (!allowed) {
    return NextResponse.json({ error: "Sem permissão para este board" }, { status: 403 });
  }

  const tOrg = Date.now();
  const org = await getOrganizationById(payload.orgId);
  logFluxApiPhase(route, "getOrganizationById", tOrg);

  const gateCtx = planGateCtxFromAuthPayload(payload);
  let sprints: Awaited<ReturnType<typeof listSprints>> = [];
  try {
    assertFeatureAllowed(org, "sprint_engine", gateCtx);
    const tSp = Date.now();
    sprints = await listSprints(payload.orgId, boardId);
    logFluxApiPhase(route, "listSprints", tSp);
  } catch {
    sprints = [];
  }

  try {
    let boardMethodology: BoardMethodology = board.boardMethodology ?? "scrum";
    let inferredMethodology = false;
    if (!board.boardMethodology) {
      boardMethodology = inferLegacyBoardMethodology(sprints.length > 0);
      inferredMethodology = true;
    }
    if (inferredMethodology) {
      await updateBoard(
        boardId,
        payload.orgId,
        { boardMethodology },
        { userId: payload.id, userName: payload.username, orgId: payload.orgId }
      );
    }
    const safe = {
      ...board,
      boardMethodology,
      portal: stripPortalForClient(board.portal),
    };
    logFluxApiPhase(route, "total", t0);
    return NextResponse.json({ board: safe, sprints });
  } catch (err) {
    console.error("Board bootstrap API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    );
  }
}
