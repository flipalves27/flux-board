import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, planGateCtxFromAuthPayload, PlanGateError } from "@/lib/plan-gates";
import { denyPlan } from "@/lib/api-authz";
import { rateLimit } from "@/lib/rate-limit";
import { runOrgLlmChat } from "@/lib/llm-org-chat";
import { buildExecutiveBriefAiUserPrompt, type ExecutiveBriefCardSlice } from "@/lib/board-executive-brief-ai";
import { hashCacheKey, getAiTextCache, setAiTextCache } from "@/lib/ai-completion-cache";
import { FLUX_LLM_PROMPT_VERSION } from "@/lib/prompt-versions";

const CACHE_TTL_SEC = 6 * 60 * 60;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id: requestedBoardId } = await params;
  if (!requestedBoardId || requestedBoardId === "boards") {
    return NextResponse.json({ error: "ID do board é obrigatório" }, { status: 400 });
  }

  const boardId = requestedBoardId;

  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) {
    return NextResponse.json({ error: "Sem permissão para este board" }, { status: 403 });
  }

  const org = await getOrganizationById(payload.orgId);
  const gateCtx = planGateCtxFromAuthPayload(payload);
  try {
    assertFeatureAllowed(org, "executive_brief", gateCtx);
  } catch (err) {
    if (err instanceof PlanGateError) return denyPlan(err);
    throw err;
  }

  const rl = await rateLimit({
    key: `exec-brief-ai:${payload.orgId}:${boardId}`,
    limit: 12,
    windowMs: 60 * 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Limite de uso. Tente mais tarde." }, { status: 429 });
  }

  const board = await getBoard(boardId, payload.orgId);
  if (!board) {
    return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });
  }

  const cacheKey = hashCacheKey([
    payload.orgId,
    boardId,
    board.lastUpdated ?? "",
    FLUX_LLM_PROMPT_VERSION,
  ]);
  const cached = await getAiTextCache(cacheKey);
  if (cached) {
    return NextResponse.json({
      markdown: cached,
      cached: true,
      promptVersion: FLUX_LLM_PROMPT_VERSION,
    });
  }

  const userPrompt = buildExecutiveBriefAiUserPrompt({
    name: board.name ?? "Board",
    cards: (board.cards ?? []) as ExecutiveBriefCardSlice[],
  });

  const res = await runOrgLlmChat({
    org,
    orgId: payload.orgId,
    feature: "board_executive_brief_ai",
    mode: "batch",
    messages: [{ role: "user", content: userPrompt }],
    options: { maxTokens: 900, temperature: 0.35 },
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: res.error ?? "Falha ao gerar resumo" },
      { status: res.error?.includes("Cota") ? 403 : 500 }
    );
  }

  const markdown = (res.assistantText ?? "").trim() || "_Sem conteúdo._";
  await setAiTextCache(cacheKey, markdown, CACHE_TTL_SEC);

  return NextResponse.json({
    markdown,
    cached: false,
    promptVersion: FLUX_LLM_PROMPT_VERSION,
    model: res.model,
  });
}
