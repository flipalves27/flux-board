import { NextRequest, NextResponse } from "next/server";
import { callFluxAi } from "@/lib/ai/gateway";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, updateBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import {
  assertFeatureAllowed,
  getDailyAiCallsCap,
  getDailyAiCallsWindowMs,
  makeDailyAiCallsRateLimitKey,
  planGateCtxFromAuthPayload,
} from "@/lib/plan-gates";
import { rateLimit } from "@/lib/rate-limit";

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
    return NextResponse.json({ error: "Briefing IA disponível no plano pago." }, { status: 403 });
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

  const body = (await request.json().catch(() => ({}))) as { assigneeId?: string };
  const assigneeId = String(body.assigneeId ?? payload.id);

  const board = await getBoard(boardId, payload.orgId);
  if (!board) return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });

  const cards = Array.isArray(board.cards) ? [...board.cards] : [];
  const idx = cards.findIndex((c) => (c as Record<string, unknown>).id === cardId);
  if (idx < 0) return NextResponse.json({ error: "Card não encontrado" }, { status: 404 });

  const card = cards[idx] as Record<string, unknown>;
  const userPrompt = `Gere um briefing curto (máx. 12 linhas) em português para quem acabou de ser assignado a este card.

Título: ${String(card.title ?? "")}
Descrição:
${String(card.desc ?? "").slice(0, 3000)}
Tags: ${Array.isArray(card.tags) ? (card.tags as string[]).join(", ") : ""}
Prioridade: ${String(card.priority ?? "")}
Progresso: ${String(card.progress ?? "")}

Inclua: contexto, próximo passo sugerido, riscos e links úteis se houver na descrição. Tom direto e acionável.`;

  const ai = await callFluxAi({
    feature: "card_onboarding",
    orgId: payload.orgId,
    userId: assigneeId,
    isAdmin: Boolean(payload.isAdmin),
    mode: "interactive",
    systemPrompt:
      "Você é a Fluxy. Escreva o briefing em markdown leve (títulos ## e listas). Sem saudações genéricas. Foque no trabalho a entregar.",
    userPrompt,
    maxTokens: 700,
    temperature: 0.35,
  });

  if (!ai.ok) {
    return NextResponse.json({ error: ai.error }, { status: 502 });
  }

  const text = ai.text.trim().slice(0, 6000);
  const nextCard = { ...card, fluxyAssigneeBriefing: text };
  cards[idx] = nextCard;

  const updated = await updateBoard(boardId, payload.orgId, { cards }, { userId: payload.id, userName: payload.username, orgId: payload.orgId });

  return NextResponse.json({ ok: true, briefing: text, boardVersion: updated?.version });
}
