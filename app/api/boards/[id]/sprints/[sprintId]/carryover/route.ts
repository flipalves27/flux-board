import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthFromRequest } from "@/lib/auth";
import { userCanAccessBoard } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, planGateCtxFromAuthPayload } from "@/lib/plan-gates";
import { createSprint, getSprint } from "@/lib/kv-sprints";
import { computeCarryoverCardIds } from "@/lib/sprint-lifecycle";

export const runtime = "nodejs";

const BodySchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  goal: z.string().trim().max(1000).optional(),
  startDate: z.string().trim().max(30).nullable().optional(),
  endDate: z.string().trim().max(30).nullable().optional(),
});

type RouteContext = { params: Promise<{ id: string; sprintId: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: boardId, sprintId } = await params;
  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const org = await getOrganizationById(payload.orgId);
  const gateCtx = planGateCtxFromAuthPayload(payload);
  try {
    assertFeatureAllowed(org, "sprint_engine", gateCtx);
  } catch {
    return NextResponse.json({ error: "Recurso disponível em planos pagos." }, { status: 403 });
  }

  const sprint = await getSprint(payload.orgId, sprintId);
  if (!sprint || sprint.boardId !== boardId) {
    return NextResponse.json({ error: "Sprint não encontrado" }, { status: 404 });
  }
  if (sprint.status !== "closed" && sprint.status !== "review") {
    return NextResponse.json({ error: "Sprint precisa estar em revisão/fechada para carryover." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Payload inválido." }, { status: 400 });

  const carryoverCardIds = computeCarryoverCardIds(sprint.cardIds, sprint.doneCardIds);
  if (carryoverCardIds.length === 0) {
    return NextResponse.json({ error: "Nenhum card pendente para carryover." }, { status: 400 });
  }

  const created = await createSprint({
    orgId: payload.orgId,
    boardId,
    name: parsed.data.name ?? `${sprint.name} (Carryover)`,
    goal: parsed.data.goal ?? sprint.goal ?? "",
    startDate: parsed.data.startDate ?? null,
    endDate: parsed.data.endDate ?? null,
    cardIds: carryoverCardIds,
    cadenceType: sprint.cadenceType,
    reviewCadenceDays: sprint.reviewCadenceDays,
    wipPolicyNote: sprint.wipPolicyNote,
    plannedCapacity: sprint.plannedCapacity,
    commitmentNote: sprint.commitmentNote,
    definitionOfDoneItemIds: sprint.definitionOfDoneItemIds,
    programIncrementId: sprint.programIncrementId,
    sprintTags: sprint.sprintTags,
    customFields: sprint.customFields,
  });

  return NextResponse.json({ sprint: created, carryoverCardIds }, { status: 201 });
}

