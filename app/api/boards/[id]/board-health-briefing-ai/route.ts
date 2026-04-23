import { type NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, planGateCtxFromAuthPayload, PlanGateError } from "@/lib/plan-gates";
import { denyPlan } from "@/lib/api-authz";
import { rateLimit } from "@/lib/rate-limit";
import { runOrgLlmChat } from "@/lib/llm-org-chat";
import { buildFlowInsightChips } from "@/lib/board-flow-insights";
import { computeBoardPortfolio } from "@/lib/board-portfolio-metrics";
import type { CardData } from "@/app/board/[id]/page";
import { buildBoardHealthBriefingUserPrompt, boardHealthBriefingSystemPrompt } from "@/lib/board-health-briefing-llm";
import { type BoardMethodology, inferLegacyBoardMethodology, isBoardMethodology } from "@/lib/board-methodology";
import { listSprints } from "@/lib/kv-sprints";
import { FLUX_LLM_PROMPT_VERSION } from "@/lib/prompt-versions";
import { hashCacheKey, getAiTextCache, setAiTextCache } from "@/lib/ai-completion-cache";

const CACHE_TTL_SEC = 45 * 60;

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
    key: `board-health-briefing:${payload.orgId}:${boardId}`,
    limit: 20,
    windowMs: 60 * 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Limite de uso. Tente mais tarde." }, { status: 429 });
  }

  const board = await getBoard(boardId, payload.orgId);
  if (!board) {
    return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });
  }

  let methodology: BoardMethodology = isBoardMethodology(board.boardMethodology)
    ? board.boardMethodology
    : "scrum";
  if (!isBoardMethodology(board.boardMethodology)) {
    const sprints = await listSprints(payload.orgId, boardId);
    methodology = inferLegacyBoardMethodology(sprints.length > 0);
  }

  const cacheKey = hashCacheKey([
    payload.orgId,
    boardId,
    board.lastUpdated ?? "",
    FLUX_LLM_PROMPT_VERSION,
    methodology,
    "health_briefing_v1",
  ]);
  const cached = await getAiTextCache(cacheKey);
  if (cached) {
    return NextResponse.json({
      markdown: cached,
      cached: true,
      promptVersion: FLUX_LLM_PROMPT_VERSION,
    });
  }

  const cards = (board.cards ?? []) as CardData[];
  const bucketOrder = (board.config?.bucketOrder ?? []) as { key: string; label?: string }[];
  const lastUpdated = board.lastUpdated ?? "";
  const chips = buildFlowInsightChips({ cards, buckets: bucketOrder as import("@/app/board/[id]/page").BucketConfig[], lastUpdated });
  const portfolio = computeBoardPortfolio({ cards, config: { bucketOrder }, lastUpdated });
  const open = cards.filter((c) => c.progress !== "Concluída");
  const inProg = open.filter((c) => c.progress === "Em andamento").length;

  const userPrompt = buildBoardHealthBriefingUserPrompt({
    boardName: board.name ?? "Board",
    lastUpdated,
    cardCount: cards.length,
    openCount: open.length,
    inProgressCount: inProg,
    portfolio,
    chips,
  });

  const system = boardHealthBriefingSystemPrompt(methodology);

  const res = await runOrgLlmChat({
    org,
    orgId: payload.orgId,
    feature: "board_health_briefing_ai",
    mode: "batch",
    messages: [
      { role: "system", content: system },
      { role: "user", content: userPrompt },
    ],
    options: { maxTokens: 700, temperature: 0.35 },
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: res.error ?? "Falha ao gerar briefing" },
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
