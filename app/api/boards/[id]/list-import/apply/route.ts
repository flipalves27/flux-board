import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import type { BoardData } from "@/app/board/[id]/page";
import { denyPlan } from "@/lib/api-authz";
import { getBoard, updateBoardFromExisting, userCanAccessBoard } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import {
  assertFeatureAllowed,
  canUseFeature,
  planGateCtxFromAuthPayload,
  PlanGateError,
} from "@/lib/plan-gates";
import { publicApiErrorResponse } from "@/lib/public-api-error";
import { rateLimit } from "@/lib/rate-limit";
import { zodErrorToMessage } from "@/lib/schemas";
import { SpecPlanApplyBodySchema } from "@/lib/spec-plan-schemas";
import { appendSpecPlanCardsToBoard } from "@/lib/spec-plan-apply-cards";

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
    assertFeatureAllowed(org, "board_pdf_list_import", gateCtx);
  } catch (err) {
    if (err instanceof PlanGateError) {
      return denyPlan(err);
    }
    throw err;
  }

  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) {
    return NextResponse.json({ error: "Sem permissão para este board" }, { status: 403 });
  }

  const rl = await rateLimit({
    key: `boards:list-import-apply:user:${payload.id}`,
    limit: 30,
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

    const oldIds = new Set(
      (Array.isArray(board.cards) ? board.cards : []).map((c) => String((c as { id?: string }).id || ""))
    );
    const newCardIds = (nextBoard.cards || [])
      .map((c) => String((c as { id?: string }).id || ""))
      .filter((id) => id && !oldIds.has(id));

    const persisted = await updateBoardFromExisting(
      board,
      { cards: nextBoard.cards },
      {
        userId: payload.id,
        userName: payload.username,
        orgId: payload.orgId,
      }
    );

    return NextResponse.json({
      ok: true,
      lastUpdated: persisted.lastUpdated,
      cardsAdded: parsed.data.cards.length,
      newCardIds,
    });
  } catch (err) {
    console.error("list-import/apply", err);
    return publicApiErrorResponse(err, {
      context: "api/boards/[id]/list-import/apply/route.ts",
      fallbackMessage: "Erro ao aplicar.",
    });
  }
}
