import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, planGateCtxFromAuthPayload, PlanGateError } from "@/lib/plan-gates";
import { denyPlan } from "@/lib/api-authz";
import { rateLimit } from "@/lib/rate-limit";
import { runOrgLlmChat } from "@/lib/llm-org-chat";
import {
  buildExecutiveRankJustifyUserPrompt,
  parseExecutiveRankJustifyLines,
  type ExecutiveRankJustifyCardLine,
} from "@/lib/board-executive-brief-ai";
import { hashCacheKey, getAiTextCache, setAiTextCache } from "@/lib/ai-completion-cache";
import { FLUX_LLM_PROMPT_VERSION } from "@/lib/prompt-versions";
import type { CardData } from "@/app/board/[id]/page";

const CACHE_TTL_SEC = 6 * 60 * 60;

function toLine(c: CardData): ExecutiveRankJustifyCardLine {
  const blockedBy = Array.isArray(c.blockedBy) ? c.blockedBy.filter((x) => typeof x === "string" && x.trim()) : [];
  return {
    id: c.id,
    title: (c.title || "").trim() || c.id,
    bucket: c.bucket,
    priority: c.priority,
    progress: c.progress,
    dueDate: c.dueDate ?? null,
    direction: c.direction ?? null,
    blockedByCount: blockedBy.length,
  };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    key: `exec-rank-justify:${payload.orgId}:${boardId}`,
    limit: 20,
    windowMs: 60 * 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Limite de uso. Tente mais tarde." }, { status: 429 });
  }

  const body: unknown = await request.json().catch(() => ({}));
  const raw = body && typeof body === "object" && "cardIds" in body ? (body as { cardIds?: unknown }).cardIds : undefined;
  const rawIds: unknown[] = Array.isArray(raw) ? raw : [];
  const normalized: string[] = [];
  for (const x of rawIds) {
    const id = String(x).trim();
    if (id.length > 0) normalized.push(id);
  }
  const cardIds = [...new Set(normalized)].slice(0, 8);
  if (cardIds.length === 0) {
    return NextResponse.json({ error: "cardIds obrigatório (máx. 8)" }, { status: 400 });
  }

  const board = await getBoard(boardId, payload.orgId);
  if (!board) {
    return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });
  }

  const cardList = (board.cards ?? []) as CardData[];
  const byId = new Map(cardList.map((c) => [c.id, c]));
  const ordered: CardData[] = [];
  for (const id of cardIds) {
    const c = byId.get(id);
    if (c) ordered.push(c);
  }
  if (ordered.length === 0) {
    return NextResponse.json({ error: "Nenhum card válido" }, { status: 400 });
  }

  const lines = ordered.map(toLine);
  const stableIdKey = cardIds.join("\u0001");

  const cacheKey = hashCacheKey([
    payload.orgId,
    boardId,
    board.lastUpdated ?? "",
    FLUX_LLM_PROMPT_VERSION,
    "executive_rank_justify_v1",
    stableIdKey,
  ]);
  const cached = await getAiTextCache(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as Record<string, string>;
      return NextResponse.json({
        justifications: parsed,
        cached: true,
        promptVersion: FLUX_LLM_PROMPT_VERSION,
      });
    } catch {
      // fall through to regenerate
    }
  }

  const userPrompt = buildExecutiveRankJustifyUserPrompt(board.name ?? "Board", lines);

  const res = await runOrgLlmChat({
    org,
    orgId: payload.orgId,
    feature: "board_executive_rank_justify",
    mode: "batch",
    messages: [{ role: "user", content: userPrompt }],
    options: { maxTokens: 500, temperature: 0.25 },
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: res.error ?? "Falha ao gerar justificativas" },
      { status: res.error?.includes("Cota") ? 403 : 500 }
    );
  }

  const justifications = parseExecutiveRankJustifyLines(res.assistantText ?? "", cardIds);
  await setAiTextCache(cacheKey, JSON.stringify(justifications), CACHE_TTL_SEC);

  return NextResponse.json({
    justifications,
    cached: false,
    promptVersion: FLUX_LLM_PROMPT_VERSION,
    model: res.model,
  });
}
