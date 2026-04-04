import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { userCanAccessBoard } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, planGateCtxFromAuthPayload } from "@/lib/plan-gates";
import { getSprint, updateSprint, getActiveSprint } from "@/lib/kv-sprints";
import { mergeBurndownSnapshotRow } from "@/lib/sprint-burndown-snapshot";
import { buildStartBurndownSnapshot } from "@/lib/sprint-lifecycle";
import { logSprintLifecycleEvent } from "@/lib/sprint-lifecycle-observability";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; sprintId: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: boardId, sprintId } = await params;
  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const org = await getOrganizationById(payload.orgId);
  const gateCtx = planGateCtxFromAuthPayload(payload);
  try { assertFeatureAllowed(org, "sprint_engine", gateCtx); } catch {
    return NextResponse.json({ error: "Recurso disponível em planos pagos." }, { status: 403 });
  }

  const sprint = await getSprint(payload.orgId, sprintId);
  if (!sprint || sprint.boardId !== boardId) return NextResponse.json({ error: "Sprint não encontrado" }, { status: 404 });
  if (sprint.status !== "planning") return NextResponse.json({ error: "Só sprints em planejamento podem ser iniciados." }, { status: 400 });

  const existingActive = await getActiveSprint(payload.orgId, boardId);
  if (existingActive && existingActive.id !== sprintId) {
    return NextResponse.json({ error: "Já existe um sprint ativo neste board." }, { status: 409 });
  }

  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const startRow = buildStartBurndownSnapshot({
    date: today,
    remainingCards: sprint.cardIds.length,
  });
  const burndownSnapshots = mergeBurndownSnapshotRow(sprint.burndownSnapshots, startRow);
  const updated = await updateSprint(payload.orgId, sprintId, {
    status: "active",
    startDate: sprint.startDate ?? today,
    burndownSnapshots,
  });
  logSprintLifecycleEvent({
    event: "sprint_start",
    orgId: payload.orgId,
    boardId,
    sprintId,
    doneCount: 0,
  });
  return NextResponse.json({ sprint: updated });
}
