import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, updateBoardFromExisting, userCanAccessBoard } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import {
  assertFeatureAllowed,
  canUseFeature,
  planGateCtxFromAuthPayload,
  PlanGateError,
} from "@/lib/plan-gates";
import { rateLimit } from "@/lib/rate-limit";
import { zodErrorToMessage } from "@/lib/schemas";
import { SpecPlanApplyBodySchema } from "@/lib/spec-plan-schemas";
import { appendSpecPlanCardsToBoard } from "@/lib/spec-plan-apply-cards";
import type { BoardData } from "@/app/board/[id]/page";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id: boardId } = await params;
  if (!boardId || boardId === "boards") {
    return NextResponse.json({ error: "ID do board é obrigatório" }, { status: 400 });
  }

  const org = await getOrganizationById(payload.orgId);
  if (!org) {
    return NextResponse.json({ error: "Org não encontrada" }, { status: 404 });
  }

  const gateCtx = planGateCtxFromAuthPayload(payload);
  try {
    assertFeatureAllowed(org, "spec_ai_scope_planner", gateCtx);
  } catch (err) {
    if (err instanceof PlanGateError) {
      return NextResponse.json(
        { error: err.message, code: err.code, feature: err.feature, requiredTiers: err.requiredTiers },
        { status: err.status }
      );
    }
    throw err;
  }

  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) {
    return NextResponse.json({ error: "Sem permissão para este board" }, { status: 403 });
  }

  const rl = await rateLimit({
    key: `boards:spec-plan-apply:user:${payload.id}`,
    limit: 20,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Muitas aplicações. Tente novamente mais tarde." }, { status: 429 });
  }

  const board = await getBoard(boardId, payload.orgId);
  if (!board) {
    return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = SpecPlanApplyBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });
  }

  const includeSubtasks = canUseFeature(org, "subtasks", gateCtx);

  try {
    const nextBoard = appendSpecPlanCardsToBoard({
      board: board as BoardData,
      drafts: parsed.data.cards,
      includeSubtasks,
    });

    const persisted = await updateBoardFromExisting(board, { cards: nextBoard.cards }, {
      userId: payload.id,
      userName: payload.username,
      orgId: payload.orgId,
    });

    return NextResponse.json({
      ok: true,
      lastUpdated: persisted.lastUpdated,
      cardsAdded: parsed.data.cards.length,
    });
  } catch (err) {
    console.error("spec-plan apply", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro ao aplicar" }, { status: 500 });
  }
}
