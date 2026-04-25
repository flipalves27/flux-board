import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { denyPlan } from "@/lib/api-authz";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import { listImportCardsFromDocument } from "@/lib/list-import-from-text";
import {
  assertFeatureAllowed,
  getDailyAiCallsCap,
  getDailyAiCallsWindowMs,
  makeDailyAiCallsRateLimitKey,
  planGateCtxFromAuthPayload,
  PlanGateError,
} from "@/lib/plan-gates";
import { publicApiErrorResponse } from "@/lib/public-api-error";
import { rateLimit } from "@/lib/rate-limit";
import { tryExtractBoardImportDocument } from "@/lib/spec-plan-form-parse";
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
    key: `boards:list-import-parse:user:${payload.id}`,
    limit: 20,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Muitas análises. Tente novamente mais tarde." }, { status: 429 });
  }

  const dailyCap = getDailyAiCallsCap(org, gateCtx);
  if (dailyCap !== null) {
    const dlr = await rateLimit({
      key: makeDailyAiCallsRateLimitKey(payload.orgId),
      limit: dailyCap,
      windowMs: getDailyAiCallsWindowMs(),
    });
    if (!dlr.allowed) {
      return NextResponse.json({ error: "Limite diário de chamadas IA atingido." }, { status: 429 });
    }
  }

  const board = await getBoard(boardId, payload.orgId);
  if (!board) {
    return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "FormData inválido" }, { status: 400 });
  }

  const extracted = await tryExtractBoardImportDocument(formData);
  if (!extracted.ok) {
    const r = extracted.response;
    const errText = await r.text();
    let body: unknown = { error: errText };
    try {
      body = errText ? JSON.parse(errText) : body;
    } catch {
      /* keep raw */
    }
    return NextResponse.json(body, { status: r.status });
  }

  const { documentText, extractMeta } = extracted;
  if (!documentText.trim()) {
    return NextResponse.json({ error: "Nenhum texto extraído.", errorCode: "EMPTY_DOCUMENT" }, { status: 400 });
  }

  try {
    const llm = await listImportCardsFromDocument({
      org,
      orgId: payload.orgId,
      userId: payload.id,
      isAdmin: !!payload.isAdmin,
      board: board as BoardData,
      documentText,
      extractMeta,
    });
    if (!llm.ok) {
      return NextResponse.json(
        { ok: false, error: llm.error, usedLlm: llm.usedLlm, extractMeta },
        { status: 422 }
      );
    }
    return NextResponse.json({
      ok: true,
      cards: llm.data.cards,
      extractMeta,
      usedLlm: llm.usedLlm,
      warnings: llm.warnings,
    });
  } catch (err) {
    console.error("list-import/parse", err);
    return publicApiErrorResponse(err, {
      context: "api/boards/[id]/list-import/parse/route.ts",
      fallbackMessage: "Erro ao analisar o documento.",
    });
  }
}
