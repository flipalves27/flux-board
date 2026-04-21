import { NextRequest, NextResponse } from "next/server";
import { callFluxAi } from "@/lib/ai/gateway";
import {
  DEFAULT_PRIORITIZATION_WEIGHTS,
  scoreBacklogCards,
  type BacklogScoreCardInput,
  type PrioritizationWeights,
} from "@/lib/backlog/score-cards";
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

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

function backlogBucketKey(board: NonNullable<Awaited<ReturnType<typeof getBoard>>>): string {
  const order = board.config?.bucketOrder as Array<{ key?: string }> | undefined;
  if (Array.isArray(order) && order[0]?.key) return String(order[0].key);
  return "backlog";
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: boardId } = await params;
  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const board = await getBoard(boardId, payload.orgId);
  if (!board) return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });

  const org = await getOrganizationById(payload.orgId);
  const gateCtx = planGateCtxFromAuthPayload(payload);

  let weights: PrioritizationWeights = { ...DEFAULT_PRIORITIZATION_WEIGHTS };
  let justify = false;
  try {
    const body = (await request.json()) as { weights?: Partial<PrioritizationWeights>; justify?: boolean };
    if (body?.weights) {
      weights = { ...DEFAULT_PRIORITIZATION_WEIGHTS, ...body.weights };
    }
    justify = Boolean(body?.justify);
  } catch {
    // opcional
  }

  const cardsRaw = (Array.isArray(board.cards) ? board.cards : []) as Array<Record<string, unknown>>;
  const bucket = backlogBucketKey(board);

  const blockCounts = new Map<string, number>();
  for (const c of cardsRaw) {
    const bb = c.blockedBy;
    if (!Array.isArray(bb)) continue;
    for (const id of bb as string[]) {
      const sid = String(id);
      blockCounts.set(sid, (blockCounts.get(sid) ?? 0) + 1);
    }
  }

  const inputs: BacklogScoreCardInput[] = [];
  for (const c of cardsRaw) {
    if (String(c.bucket) !== bucket) continue;
    if (String(c.progress) === "Concluída") continue;
    const id = String(c.id ?? "");
    if (!id) continue;
    inputs.push({
      id,
      title: String(c.title ?? ""),
      dueDate: typeof c.dueDate === "string" ? c.dueDate : null,
      tags: Array.isArray(c.tags) ? (c.tags as string[]).map((t) => String(t)) : [],
      storyPoints: typeof c.storyPoints === "number" ? c.storyPoints : null,
      blockingCount: blockCounts.get(id) ?? 0,
    });
  }

  const scored = scoreBacklogCards(inputs, weights);
  const orderedIds = scored.map((s) => s.id);

  let justifications: Record<string, string> | undefined;
  if (justify) {
    try {
      assertFeatureAllowed(org, "card_context", gateCtx);
    } catch {
      return NextResponse.json({ error: "Justificativas IA disponíveis no plano pago." }, { status: 403 });
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

    const lines = scored.slice(0, 25).map((s, i) => `${i + 1}. [${s.id}] ${s.title.slice(0, 120)} — score ${s.priorityScore.toFixed(3)}`);
    const userPrompt = `Para cada card abaixo, responda com UMA frase curta em português explicando a priorização (ou despriorização) pelo score.\nFormato EXATO, uma linha por card, assim:\n<cardId>|sua frase aqui\n\nCards:\n${lines.join("\n")}`;

    const ai = await callFluxAi({
      feature: "backlog_prioritize_justify",
      orgId: payload.orgId,
      userId: payload.id,
      isAdmin: Boolean(payload.isAdmin),
      mode: "batch",
      planGateCtx: gateCtx,
      systemPrompt:
        "Você é a Fluxy. Responda apenas linhas cardId|frase, sem markdown, sem texto extra. Uma linha por card, na mesma ordem da lista.",
      userPrompt,
      maxTokens: 900,
      temperature: 0.2,
    });

    if (ai.ok) {
      justifications = {};
      for (const line of ai.text.split("\n")) {
        const pipe = line.indexOf("|");
        if (pipe <= 0) continue;
        const cid = line.slice(0, pipe).trim();
        const msg = line.slice(pipe + 1).trim();
        if (cid && msg) justifications[cid] = msg.slice(0, 400);
      }
    }
  }

  return NextResponse.json({
    backlogBucket: bucket,
    weights,
    scored,
    orderedIds,
    ...(justifications ? { justifications } : {}),
  });
}
