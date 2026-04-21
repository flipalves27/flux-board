import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import {
  assertFeatureAllowed,
  getDailyAiCallsCap,
  getDailyAiCallsWindowMs,
  makeDailyAiCallsRateLimitKey,
  planGateCtxFromAuthPayload,
} from "@/lib/plan-gates";
import { rateLimit } from "@/lib/rate-limit";
import { assertOrgAiBudget } from "@/lib/ai-org-budget";
import { generateUnblockAssistPlan } from "@/lib/unblock-assist-llm";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; cardId: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: boardId, cardId } = await params;
  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const org = await getOrganizationById(payload.orgId);
  const gateCtx = planGateCtxFromAuthPayload(payload);
  try {
    assertFeatureAllowed(org, "card_context", gateCtx);
  } catch {
    return NextResponse.json({ error: "Recurso disponível em planos pagos." }, { status: 403 });
  }

  const dailyCap = getDailyAiCallsCap(org, gateCtx);
  if (dailyCap !== null) {
    const rl = await rateLimit({
      key: makeDailyAiCallsRateLimitKey(payload.orgId),
      limit: dailyCap,
      windowMs: getDailyAiCallsWindowMs(),
    });
    if (!rl.allowed) return NextResponse.json({ error: "Limite diário de chamadas IA atingido." }, { status: 429 });
  }

  const budget = await assertOrgAiBudget(payload.orgId);
  if (!budget.ok) return NextResponse.json({ error: budget.message }, { status: 429 });

  const board = await getBoard(boardId, payload.orgId);
  if (!board) return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });

  const cards = Array.isArray(board.cards) ? board.cards : [];
  const card = cards.find((c) => c && typeof c === "object" && String((c as { id?: string }).id) === cardId) as
    | {
        id?: string;
        title?: string;
        desc?: string;
        blockedBy?: string[];
      }
    | undefined;

  if (!card) return NextResponse.json({ error: "Card não encontrado" }, { status: 404 });

  const blockedBy = Array.isArray(card.blockedBy) ? card.blockedBy.filter((x) => typeof x === "string" && x.trim()) : [];
  if (blockedBy.length === 0) {
    return NextResponse.json({ error: "Este card não tem dependências bloqueadoras." }, { status: 400 });
  }

  const blockerSummaries = blockedBy
    .map((bid) => {
      const b = cards.find((c) => c && String((c as { id?: string }).id) === bid) as { title?: string } | undefined;
      return b?.title ? `${bid}: ${String(b.title).slice(0, 120)}` : bid;
    })
    .filter(Boolean);

  const result = await generateUnblockAssistPlan({
    cardTitle: String(card.title || "").trim() || cardId,
    cardDescription: String(card.desc || "").trim(),
    blockerSummaries,
  });

  if ("error" in result && !("steps" in result)) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  const ok = result as import("@/lib/unblock-assist-llm").UnblockAssistResult;
  return NextResponse.json({
    schema: "flux-board.unblock_assist.v1",
    steps: ok.steps,
    notifyHint: ok.notifyHint,
    usedLlm: ok.usedLlm,
    model: ok.model,
  });
}
