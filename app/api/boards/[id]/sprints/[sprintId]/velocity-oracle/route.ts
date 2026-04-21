import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, planGateCtxFromAuthPayload, PlanGateError } from "@/lib/plan-gates";
import { denyPlan } from "@/lib/api-authz";
import { getSprint } from "@/lib/kv-sprints";
import { computeVelocityOracle } from "@/lib/velocity-oracle";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sprintId: string }> }
) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: boardId, sprintId } = await params;
  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const org = await getOrganizationById(payload.orgId);
  const gateCtx = planGateCtxFromAuthPayload(payload);
  try {
    assertFeatureAllowed(org, "risk_score", gateCtx);
  } catch (err) {
    if (err instanceof PlanGateError) return denyPlan(err);
    throw err;
  }

  const [board, sprint] = await Promise.all([
    getBoard(boardId, payload.orgId),
    getSprint(payload.orgId, sprintId),
  ]);
  if (!board) return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });
  if (!sprint) return NextResponse.json({ error: "Sprint não encontrada" }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const removeCards = parseInt(searchParams.get("removeCards") ?? "0", 10) || 0;
  const capacityMultiplier = parseFloat(searchParams.get("capacityMultiplier") ?? "1") || 1;

  const allCards = (Array.isArray(board.cards) ? board.cards : []) as Parameters<
    typeof computeVelocityOracle
  >[0];

  const sprintCardIds = new Set([...(sprint.cardIds ?? []), ...(sprint.doneCardIds ?? [])]);
  const sprintCards = allCards.filter((c) => sprintCardIds.has(c.id));

  const result = computeVelocityOracle(sprintCards, sprint.endDate ?? null, {
    removeCards,
    capacityMultiplier,
  });

  return NextResponse.json({ ok: true, result });
}
