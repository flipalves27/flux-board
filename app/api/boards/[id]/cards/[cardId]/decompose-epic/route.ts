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

function backlogBucketKey(board: NonNullable<Awaited<ReturnType<typeof getBoard>>>): string {
  const order = board.config?.bucketOrder as Array<{ key?: string }> | undefined;
  if (Array.isArray(order) && order[0]?.key) return String(order[0].key);
  return "backlog";
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: boardId, cardId } = await params;
  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const org = await getOrganizationById(payload.orgId);
  const gateCtx = planGateCtxFromAuthPayload(payload);
  try {
    assertFeatureAllowed(org, "ai_card_writer", gateCtx);
  } catch {
    return NextResponse.json({ error: "Recurso disponível no plano pago." }, { status: 403 });
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

  const board = await getBoard(boardId, payload.orgId);
  if (!board) return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });

  const cards = Array.isArray(board.cards) ? [...board.cards] : [];
  const epic = cards.find((c) => (c as Record<string, unknown>).id === cardId) as Record<string, unknown> | undefined;
  if (!epic) return NextResponse.json({ error: "Card não encontrado" }, { status: 404 });

  const epicTitle = String(epic.title ?? "");
  const epicDesc = String(epic.desc ?? "");
  const teamContext = `Board: ${board.name}. Metodologia: ${board.boardMethodology ?? "kanban"}.`;

  const systemPrompt = `Você é a Fluxy, especialista em engenharia de software e agilidade.
Decomponha épicos em histórias de usuário seguindo o padrão: "Como [persona], quero [ação] para [benefício]".
Cada história deve ter critérios de aceite testáveis.
Retorne APENAS JSON válido, sem markdown.`;

  const userPrompt = `Épico (título): "${epicTitle}"
Descrição atual:
${epicDesc.slice(0, 4000)}

Contexto do time: ${teamContext}

Decomponha em 3-8 histórias de usuário. Retorne JSON:
{
  "stories": [
    {
      "title": "Como...",
      "description": "string",
      "acceptance_criteria": ["Dado que...", "Quando...", "Então..."],
      "story_points": 3,
      "suggested_labels": ["backend", "frontend"]
    }
  ]
}`;

  const ai = await callFluxAi({
    feature: "epic_decomposition",
    orgId: payload.orgId,
    userId: payload.id,
    isAdmin: Boolean(payload.isAdmin),
    mode: "batch",
    systemPrompt,
    userPrompt,
    maxTokens: 2200,
    temperature: 0.35,
  });

  if (!ai.ok) {
    return NextResponse.json({ error: ai.error }, { status: 502 });
  }

  let stories: Array<{
    title?: string;
    description?: string;
    acceptance_criteria?: string[];
    story_points?: number;
    suggested_labels?: string[];
  }> = [];

  try {
    const m = ai.text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("no json");
    const parsed = JSON.parse(m[0]) as { stories?: typeof stories };
    stories = Array.isArray(parsed.stories) ? parsed.stories : [];
  } catch {
    return NextResponse.json({ error: "Não foi possível interpretar a resposta da IA." }, { status: 422 });
  }

  const backlogKey = backlogBucketKey(board);
  const baseOrder = Date.now();
  const newCards: Record<string, unknown>[] = [];

  let i = 0;
  for (const story of stories.slice(0, 12)) {
    const title = String(story.title ?? "").trim().slice(0, 220);
    if (!title) continue;
    const criteria = Array.isArray(story.acceptance_criteria) ? story.acceptance_criteria.map((x) => String(x).trim()).filter(Boolean) : [];
    const descParts = [String(story.description ?? "").trim(), criteria.length ? `\n\n**Critérios de aceite**\n- ${criteria.join("\n- ")}` : ""].filter(Boolean);
    const sp = typeof story.story_points === "number" && Number.isFinite(story.story_points) ? Math.min(13, Math.max(1, Math.round(story.story_points))) : null;
    const tags = Array.isArray(story.suggested_labels)
      ? story.suggested_labels.map((t) => String(t).trim()).filter(Boolean).slice(0, 8)
      : [];

    newCards.push({
      id: `c_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 7)}`,
      bucket: backlogKey,
      priority: "Média",
      progress: "Não iniciado",
      title,
      desc: descParts.join("\n").slice(0, 8000),
      tags,
      direction: null,
      dueDate: null,
      order: baseOrder + i,
      storyPoints: sp,
      epicParentId: cardId,
      createdByFluxy: true,
    });
    i += 1;
  }

  if (!newCards.length) {
    return NextResponse.json({ error: "Nenhuma história válida gerada." }, { status: 422 });
  }

  const nextBoard = await updateBoard(
    boardId,
    payload.orgId,
    { cards: [...cards, ...newCards] },
    { userId: payload.id, userName: payload.username, orgId: payload.orgId }
  );

  return NextResponse.json({ ok: true, created: newCards.length, cards: newCards, boardVersion: nextBoard?.version });
}
