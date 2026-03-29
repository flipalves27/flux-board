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
import { getSprint } from "@/lib/kv-sprints";
import { buildSprintOverview, sprintOverviewToPromptContext } from "@/lib/sprint-overview";
import { rateLimit } from "@/lib/rate-limit";
import { guardUserPromptForLlm } from "@/lib/prompt-guard";
import { sanitizeText } from "@/lib/schemas";
import { runOrgLlmChat } from "@/lib/llm-org-chat";
import { fluxyPromptPrefix } from "@/lib/fluxy-persona";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; sprintId: string }> };

type Body = { question?: string };

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

  const dailyCap = getDailyAiCallsCap(org, gateCtx);
  if (dailyCap !== null) {
    const rl = await rateLimit({
      key: makeDailyAiCallsRateLimitKey(payload.orgId),
      limit: dailyCap,
      windowMs: getDailyAiCallsWindowMs(),
    });
    if (!rl.allowed) return NextResponse.json({ error: "Limite diário de chamadas IA atingido." }, { status: 429 });
  }

  const sprint = await getSprint(payload.orgId, sprintId);
  if (!sprint || sprint.boardId !== boardId) return NextResponse.json({ error: "Sprint não encontrado" }, { status: 404 });

  const board = await getBoard(boardId, payload.orgId);
  if (!board) return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const rawQ = sanitizeText(body.question ?? "").trim();
  const guarded = guardUserPromptForLlm(rawQ);
  const question = guarded.text;
  if (!question) return NextResponse.json({ error: "Pergunta é obrigatória." }, { status: 400 });

  const overview = buildSprintOverview(board, sprint);
  const ctx = sprintOverviewToPromptContext(board.name, overview);

  const systemContent = fluxyPromptPrefix(
    [
      "Você é a Fluxy, assistente de agilidade no Flux-Board.",
      "Responda à pergunta do utilizador com base **apenas** no contexto da sprint abaixo.",
      "Se faltar informação, diga claramente o que não consta nos dados.",
      "Cite IDs de cards entre colchetes quando relevante (ex.: [c_abc]).",
      "Seja concisa e em português brasileiro, salvo se a pergunta for noutro idioma.",
      "\n### Contexto da sprint\n" + ctx,
    ].join("\n")
  );

  const res = await runOrgLlmChat({
    org,
    orgId: payload.orgId,
    feature: "sprint_history_qa",
    mode: "interactive",
    userId: payload.id,
    isAdmin: payload.isAdmin,
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: question },
    ],
    options: { temperature: 0.35, maxTokens: 2000 },
  });

  if (!res.ok) {
    return NextResponse.json({ error: res.error || "Falha ao gerar resposta." }, { status: 502 });
  }

  return NextResponse.json({
    answer: res.assistantText.trim(),
    model: res.model,
    provider: res.provider,
  });
}
