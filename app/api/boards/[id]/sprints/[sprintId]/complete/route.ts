import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, planGateCtxForAuth } from "@/lib/plan-gates";
import { computeDoneCardIdsForSprintCards } from "@/lib/sprint-lifecycle";
import { getSprint, updateSprint } from "@/lib/kv-sprints";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; sprintId: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: boardId, sprintId } = await params;
  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const org = await getOrganizationById(payload.orgId);
  const gateCtx = planGateCtxForAuth(payload.isAdmin, payload.isExecutive);
  try { assertFeatureAllowed(org, "sprint_engine", gateCtx); } catch {
    return NextResponse.json({ error: "Recurso disponível em planos pagos." }, { status: 403 });
  }

  const sprint = await getSprint(payload.orgId, sprintId);
  if (!sprint || sprint.boardId !== boardId) return NextResponse.json({ error: "Sprint não encontrado" }, { status: 404 });
  if (sprint.status !== "active") return NextResponse.json({ error: "Só sprints ativos podem ser completados." }, { status: 400 });

  const board = await getBoard(boardId, payload.orgId);
  const cards = Array.isArray(board?.cards) ? (board!.cards as Array<Record<string, unknown>>) : [];
  const doneCardIds = computeDoneCardIdsForSprintCards(sprint.cardIds, cards);
  const velocity = doneCardIds.length;

  const updated = await updateSprint(payload.orgId, sprintId, {
    status: "review",
    doneCardIds,
    velocity,
    endDate: sprint.endDate ?? new Date().toISOString().slice(0, 10),
  });
  return NextResponse.json({ sprint: updated });
}
