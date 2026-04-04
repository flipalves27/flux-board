import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, planGateCtxFromAuthPayload } from "@/lib/plan-gates";
import { listSprints } from "@/lib/kv-sprints";
import { sprintToBoardHistoryRow } from "@/lib/sprint-board-history";
import type { SprintData } from "@/lib/schemas";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: boardId } = await params;
  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const org = await getOrganizationById(payload.orgId);
  const gateCtx = planGateCtxFromAuthPayload(payload);
  try {
    assertFeatureAllowed(org, "sprint_engine", gateCtx);
  } catch {
    return NextResponse.json({ error: "Recurso disponível em planos pagos." }, { status: 403 });
  }

  const board = await getBoard(boardId, payload.orgId);
  if (!board) return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });

  const sp = request.nextUrl.searchParams;
  const statusFilter = sp.get("status")?.trim();
  const includeCardRows = sp.get("includeCardRows") === "1";

  let sprints = await listSprints(payload.orgId, boardId);
  if (statusFilter && statusFilter !== "all") {
    const allowed: SprintData["status"][] = ["planning", "active", "review", "closed"];
    if (allowed.includes(statusFilter as SprintData["status"])) {
      sprints = sprints.filter((s) => s.status === statusFilter);
    }
  }

  const rows = sprints.map((s) => sprintToBoardHistoryRow(board, s, { includeCardRows }));

  return NextResponse.json({
    boardId: board.id,
    boardName: board.name || board.id,
    sprints: rows,
  });
}
