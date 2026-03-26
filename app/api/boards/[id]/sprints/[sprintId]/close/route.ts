import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, updateBoardFromExisting, userCanAccessBoard } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import { getSprint, updateSprint } from "@/lib/kv-sprints";
import { assertFeatureAllowed, planGateCtxForAuth } from "@/lib/plan-gates";
import { mergeBurndownSnapshotRow } from "@/lib/sprint-burndown-snapshot";
import {
  applyCarryoverTagToBoardCards,
  buildClosingBurndownSnapshot,
  computeCarryoverCardIds,
} from "@/lib/sprint-lifecycle";
import { enqueueWebhookDeliveriesForEvent } from "@/lib/webhook-delivery";

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
  try {
    assertFeatureAllowed(org, "sprint_engine", gateCtx);
  } catch {
    return NextResponse.json({ error: "Recurso disponível em planos pagos." }, { status: 403 });
  }

  const sprint = await getSprint(payload.orgId, sprintId);
  if (!sprint || sprint.boardId !== boardId) {
    return NextResponse.json({ error: "Sprint não encontrado" }, { status: 404 });
  }
  if (sprint.status !== "review") {
    return NextResponse.json({ error: "Só sprints em revisão podem ser fechados." }, { status: 400 });
  }

  const board = await getBoard(boardId, payload.orgId);
  if (!board) return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });

  const carryoverIds = computeCarryoverCardIds(sprint.cardIds, sprint.doneCardIds);
  const carrySet = new Set(carryoverIds);

  const nextCards = applyCarryoverTagToBoardCards(board.cards ?? [], carrySet);
  if (JSON.stringify(nextCards) !== JSON.stringify(board.cards ?? [])) {
    await updateBoardFromExisting(board, { cards: nextCards }, {
      userId: payload.id,
      userName: payload.username,
      orgId: payload.orgId,
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  const closingRow = buildClosingBurndownSnapshot({
    date: today,
    remainingCards: carryoverIds.length,
  });
  const burndownSnapshots = mergeBurndownSnapshotRow(sprint.burndownSnapshots, closingRow);

  const velocity = sprint.doneCardIds.length;

  const updated = await updateSprint(payload.orgId, sprintId, {
    status: "closed",
    velocity,
    burndownSnapshots,
  });
  if (!updated) {
    return NextResponse.json({ error: "Falha ao atualizar sprint." }, { status: 500 });
  }

  void enqueueWebhookDeliveriesForEvent(payload.orgId, "sprint.closed", {
    sprintId,
    boardId,
    velocity,
    carryoverCardIds: carryoverIds,
  });

  return NextResponse.json({ sprint: updated, carryoverCardIds: carryoverIds });
}
