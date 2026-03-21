import { NextRequest, NextResponse } from "next/server";
import { enrichSmartCardWithTogether } from "@/lib/automation-ai";
import { getAuthFromRequest } from "@/lib/auth";
import {
  assertFeatureAllowed,
  canUseFeature,
  getDailyAiCallsCap,
  getDailyAiCallsWindowMs,
  makeDailyAiCallsRateLimitKey,
  PlanGateError,
} from "@/lib/plan-gates";
import { getBoard, getBoardRebornId, userCanAccessBoard } from "@/lib/kv-boards";
import { searchDocs } from "@/lib/kv-docs";
import { getOrganizationById } from "@/lib/kv-organizations";
import { rateLimit } from "@/lib/rate-limit";
import { sanitizeText, SmartCardEnrichInputSchema, zodErrorToMessage } from "@/lib/schemas";
import {
  dueDateFromLeadStats,
  leadTimeStatsFromSimilarConcluded,
  pickSimilarCardRefs,
} from "@/lib/smart-card-enrich";

const PRIORITIES = new Set(["Urgente", "Importante", "Média"]);

function normalizeResponse(args: {
  boardBuckets: string[];
  labelPalette: string[];
  allowedDirections: string[];
  llm: {
    bucketKey: string;
    priority: string;
    priorityRationale: string;
    tags: string[];
    description: string;
    direction: string | null;
  } | null;
  fallbackFirstBucket: string;
  title: string;
  dueDate: string | null;
  dueExplanationKey: "similar" | "none";
  similarSampleCount: number;
  usedLlm: boolean;
}) {
  const first = args.fallbackFirstBucket;
  const bucketSet = new Set(args.boardBuckets);
  let bucketKey = args.llm?.bucketKey?.trim() || "";
  if (!bucketSet.has(bucketKey)) bucketKey = bucketSet.has(first) ? first : args.boardBuckets[0] || first;

  let priority = args.llm?.priority?.trim() || "Média";
  if (!PRIORITIES.has(priority)) priority = "Média";

  const tagSet = new Set(args.labelPalette.map((t) => String(t).trim()).filter(Boolean));
  const tags = (args.llm?.tags || [])
    .map((t) => String(t).trim())
    .filter((t) => tagSet.has(t))
    .slice(0, 5);

  let direction: string | null = args.llm?.direction ?? null;
  if (direction && !args.allowedDirections.includes(direction)) direction = null;

  let description = String(args.llm?.description || "").trim();
  if (!description) {
    description = [
      `Card: ${args.title.slice(0, 200)}.`,
      "Descreva o contexto de negócio, o resultado esperado e os critérios de aceite com o time.",
      "Use os blocos abaixo para detalhar escopo e riscos quando possível.",
    ].join(" ");
  }

  let priorityRationale = String(args.llm?.priorityRationale || "").trim();
  if (!priorityRationale) {
    priorityRationale = args.usedLlm
      ? "Sugestão automática com base no título e no contexto do quadro."
      : "Fallback offline: prioridade padrão (Média).";
  }

  return {
    bucketKey,
    priority,
    priorityRationale,
    tags,
    description: description.slice(0, 4000),
    direction,
    dueDate: args.dueDate,
    dueExplanationKey: args.dueExplanationKey,
    similarSampleCount: args.similarSampleCount,
  };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id: requestedBoardId } = await params;
  if (!requestedBoardId || requestedBoardId === "boards") {
    return NextResponse.json({ error: "ID do board é obrigatório" }, { status: 400 });
  }
  let boardId = requestedBoardId;
  if (requestedBoardId === "b_reborn") {
    const scopedRebornId = getBoardRebornId(payload.orgId);
    if (scopedRebornId !== requestedBoardId) {
      const scopedBoard = await getBoard(scopedRebornId, payload.orgId);
      if (scopedBoard) boardId = scopedRebornId;
    }
  }

  const org = await getOrganizationById(payload.orgId);
  let planBlocksAi = false;
  try {
    assertFeatureAllowed(org, "card_context");
  } catch (err) {
    if (err instanceof PlanGateError) planBlocksAi = true;
    else throw err;
  }

  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) {
    return NextResponse.json({ error: "Sem permissão para este board" }, { status: 403 });
  }

  const rl = await rateLimit({
    key: `boards:smart-enrich:user:${payload.id}`,
    limit: 40,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Muitas requisições. Tente novamente mais tarde." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  try {
    const body = await request.json();
    const parsed = SmartCardEnrichInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });
    }

    const title = sanitizeText(parsed.data.title).trim();
    if (!title) {
      return NextResponse.json({ error: "Título é obrigatório." }, { status: 400 });
    }

    const labelPalette = Array.isArray(parsed.data.knownTags)
      ? [...new Set(parsed.data.knownTags.map((t) => sanitizeText(t).trim()).filter(Boolean))].slice(0, 120)
      : [];

    const board = await getBoard(boardId, payload.orgId);
    if (!board) {
      return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });
    }

    const cards = Array.isArray(board.cards) ? board.cards : [];
    const bucketOrder = Array.isArray(board.config?.bucketOrder) ? board.config!.bucketOrder : [];
    const boardBuckets = bucketOrder
      .map((b) => String((b as { key?: string })?.key || "").trim())
      .filter(Boolean)
      .slice(0, 40);
    const fallbackFirstBucket = boardBuckets[0] || "backlog";

    const similar = pickSimilarCardRefs(cards, title, { limit: 8, excludeId: "" });
    const leadStats = leadTimeStatsFromSimilarConcluded(cards, title, board, { topN: 8, excludeId: "" });
    const due = dueDateFromLeadStats(leadStats);

    const recentLines = [...cards]
      .filter((c) => c && typeof c === "object")
      .map((c) => {
        const r = c as Record<string, unknown>;
        return {
          t: String(r.title || "").trim(),
          updated: String(r.columnEnteredAt || "") || String(board.lastUpdated || ""),
        };
      })
      .filter((x) => x.t)
      .sort((a, b) => (a.updated < b.updated ? 1 : -1))
      .slice(0, 12)
      .map((x) => `${x.t.slice(0, 100)}`);

    const ragExcerpts: string[] = [];
    if (canUseFeature(org, "flux_docs")) {
      try {
        const docs = await searchDocs(payload.orgId, title, 4);
        for (const d of docs.slice(0, 3)) {
          const ex = String(d.excerpt || d.contentMd || "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 420);
          ragExcerpts.push(`${d.title}: ${ex}`);
        }
      } catch {
        // ignore RAG failures
      }
    }

    const allowedDirections = ["Manter", "Priorizar", "Adiar", "Cancelar", "Reavaliar"];

    const buildHeuristicLlm = () => ({
      bucketKey: fallbackFirstBucket,
      priority: "Média",
      priorityRationale: "Fallback offline: prioridade padrão.",
      tags: [] as string[],
      description: "",
      direction: null as string | null,
    });

    if (planBlocksAi) {
      const normalized = normalizeResponse({
        boardBuckets: boardBuckets.length ? boardBuckets : [fallbackFirstBucket],
        labelPalette,
        allowedDirections,
        llm: buildHeuristicLlm(),
        fallbackFirstBucket,
        title,
        dueDate: due.dueDate,
        dueExplanationKey: due.explanationKey,
        similarSampleCount: leadStats.sampleCount,
        usedLlm: false,
      });
      return NextResponse.json({ ok: true, usedLlm: false, planBlocked: true, ...normalized });
    }

    let usedLlm = false;
    let llmPayload = buildHeuristicLlm();

    const togetherEnabled = Boolean(process.env.TOGETHER_API_KEY) && Boolean(process.env.TOGETHER_MODEL);
    if (togetherEnabled) {
      const cap = getDailyAiCallsCap(org);
      if (cap !== null) {
        const dailyKey = makeDailyAiCallsRateLimitKey(payload.orgId);
        const rlDaily = await rateLimit({
          key: dailyKey,
          limit: cap,
          windowMs: getDailyAiCallsWindowMs(),
        });
        if (!rlDaily.allowed) {
          const normalized = normalizeResponse({
            boardBuckets: boardBuckets.length ? boardBuckets : [fallbackFirstBucket],
            labelPalette,
            allowedDirections,
            llm: buildHeuristicLlm(),
            fallbackFirstBucket,
            title,
            dueDate: due.dueDate,
            dueExplanationKey: due.explanationKey,
            similarSampleCount: leadStats.sampleCount,
            usedLlm: false,
          });
          return NextResponse.json({
            ok: true,
            usedLlm: false,
            dailyCapBlocked: true,
            ...normalized,
          });
        }
      }

      const r = await enrichSmartCardWithTogether({
        board,
        title,
        knownTags: labelPalette,
        similarCards: similar,
        recentCardLines: recentLines,
        ragExcerpts,
        leadStats,
        allowedDirections,
      });
      if (r.ok && r.data) {
        usedLlm = true;
        llmPayload = {
          bucketKey: r.data.bucketKey,
          priority: r.data.priority,
          priorityRationale: r.data.priorityRationale,
          tags: r.data.tags,
          description: r.data.description,
          direction: r.data.direction,
        };
      }
    }

    const normalized = normalizeResponse({
      boardBuckets: boardBuckets.length ? boardBuckets : [fallbackFirstBucket],
      labelPalette,
      allowedDirections,
      llm: llmPayload,
      fallbackFirstBucket,
      title,
      dueDate: due.dueDate,
      dueExplanationKey: due.explanationKey,
      similarSampleCount: leadStats.sampleCount,
      usedLlm,
    });

    return NextResponse.json({ ok: true, usedLlm, ...normalized });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    );
  }
}
