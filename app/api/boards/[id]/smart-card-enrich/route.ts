import { NextRequest, NextResponse } from "next/server";
import { enrichSmartCardWithTogether } from "@/lib/automation-ai";
import { getAuthFromRequest } from "@/lib/auth";
import type { PlanGateContext } from "@/lib/plan-gates";
import {
  assertFeatureAllowed,
  canUseFeature,
  getDailyAiCallsCap,
  getDailyAiCallsWindowMs,
  makeDailyAiCallsRateLimitKey,
  planGateCtxFromAuthPayload,
  PlanGateError,
} from "@/lib/plan-gates";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { searchDocs } from "@/lib/kv-docs";
import { getOrganizationById } from "@/lib/kv-organizations";
import type { Organization } from "@/lib/kv-organizations";
import { rateLimit } from "@/lib/rate-limit";
import { sanitizeText, SmartCardEnrichInputSchema, zodErrorToMessage } from "@/lib/schemas";
import {
  dueDateFromLeadStats,
  leadTimeStatsFromSimilarConcluded,
  pickSimilarCardRefs,
} from "@/lib/smart-card-enrich";
import { resolveBatchLlmRoute } from "@/lib/org-ai-routing";
import { createTogetherProvider, createAnthropicProvider } from "@/lib/llm-provider";
import { parseDecomposeSubtasksFromAssistant } from "@/lib/decompose-subtasks-from-llm";

async function handleDecomposeMode(
  body: Record<string, unknown>,
  _orgId: string,
  _boardId: string,
  planBlocksAi: boolean,
  org: Organization | null,
  planGateCtx?: PlanGateContext
): Promise<NextResponse> {
  const cardId = typeof body.cardId === "string" ? body.cardId : "";
  const title = sanitizeText(String(body.title ?? "")).trim().slice(0, 300);
  const desc = sanitizeText(String(body.desc ?? "")).trim().slice(0, 2000);

  if (planBlocksAi || !title) {
    return NextResponse.json({ ok: true, subtasks: [] });
  }

  const prompt = `Você é um assistente de decomposição de tarefas para gestão ágil. Dado o título e descrição de um card, gere uma lista de subtasks claras e acionáveis em português.

Card: "${title}"
${desc ? `Descrição: "${desc.slice(0, 500)}"` : ""}

Responda em JSON válido:
{"subtasks": [{"title": "string (max 200 chars)", "priority": "low|medium|high", "estimateHours": number|null}]}
Máximo 8 subtasks. Seja conciso e específico.`;

  try {
    const { route } = resolveBatchLlmRoute(org, planGateCtx);
    const provider = route === "anthropic" ? createAnthropicProvider() : createTogetherProvider();
    const result = await provider.chat(
      [{ role: "user", content: prompt }],
      undefined,
      { maxTokens: 600, temperature: 0.4 }
    );
    if (!result.ok) return NextResponse.json({ ok: true, subtasks: [] });
    const subtasks = parseDecomposeSubtasksFromAssistant(result.assistantText);
    return NextResponse.json({ ok: true, subtasks });
  } catch {
    return NextResponse.json({ ok: true, subtasks: [] });
  }
}

async function handleCreateFromProseMode(
  body: Record<string, unknown>,
  _orgId: string,
  _boardId: string,
  planBlocksAi: boolean,
  org: Organization | null,
  planGateCtx?: PlanGateContext
): Promise<NextResponse> {
  const prose = sanitizeText(String(body.prose ?? "")).trim().slice(0, 1000);
  if (planBlocksAi || !prose) {
    return NextResponse.json({ ok: false, error: "Texto obrigatório." }, { status: 400 });
  }

  const prompt = `Você é um assistente de criação de cards para gestão ágil. A partir de uma descrição em linguagem natural, crie um card estruturado.

Descrição: "${prose}"

Responda em JSON válido:
{
  "title": "título conciso do card (max 200 chars)",
  "description": "descrição com contexto e critérios de aceite (max 800 chars)",
  "priority": "Urgente|Importante|Média",
  "tags": ["tag1"],
  "subtasks": [{"title": "subtask", "priority": "low|medium|high"}],
  "suggestedColumn": "nome sugerido para coluna (ex: Backlog)"
}`;

  try {
    const { route } = resolveBatchLlmRoute(org, planGateCtx);
    const provider = route === "anthropic" ? createAnthropicProvider() : createTogetherProvider();
    const result = await provider.chat(
      [{ role: "user", content: prompt }],
      undefined,
      { maxTokens: 800, temperature: 0.4 }
    );
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
    const jsonMatch = result.assistantText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ ok: false, error: "Resposta inválida" }, { status: 500 });
    const parsed = JSON.parse(jsonMatch[0]) as {
      title?: string;
      description?: string;
      priority?: string;
      tags?: string[];
      subtasks?: Array<{ title: string; priority?: string }>;
      suggestedColumn?: string;
    };
    return NextResponse.json({
      ok: true,
      title: sanitizeText(String(parsed.title ?? prose.slice(0, 100))).trim().slice(0, 200),
      description: sanitizeText(String(parsed.description ?? "")).trim().slice(0, 800),
      priority: ["Urgente", "Importante", "Média"].includes(String(parsed.priority ?? "")) ? parsed.priority : "Média",
      tags: Array.isArray(parsed.tags) ? parsed.tags.map(String).slice(0, 5) : [],
      subtasks: Array.isArray(parsed.subtasks) ? parsed.subtasks.slice(0, 6).map((s, i) => ({
        title: sanitizeText(String(s.title ?? "")).trim().slice(0, 300),
        priority: ["low","medium","high"].includes(String(s.priority ?? "")) ? s.priority : "medium",
        status: "pending" as const,
        order: i,
      })) : [],
      suggestedColumn: sanitizeText(String(parsed.suggestedColumn ?? "Backlog")).trim().slice(0, 200),
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Erro interno" }, { status: 500 });
  }
}

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
  const payload = await getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id: requestedBoardId } = await params;
  if (!requestedBoardId || requestedBoardId === "boards") {
    return NextResponse.json({ error: "ID do board é obrigatório" }, { status: 400 });
  }
  const boardId = requestedBoardId;

  const org = await getOrganizationById(payload.orgId);
  const gateCtx = planGateCtxFromAuthPayload(payload);
  let planBlocksAi = false;
  try {
    assertFeatureAllowed(org, "card_context", gateCtx);
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
    const mode = typeof (body as Record<string, unknown>).mode === "string" ? (body as Record<string, unknown>).mode as string : null;

    // mode=decompose: generate subtasks from card title+desc
    if (mode === "decompose") {
      return handleDecomposeMode(body as Record<string, unknown>, payload.orgId, boardId, planBlocksAi, org, gateCtx);
    }

    // mode=create-from-prose: generate full card from natural language description
    if (mode === "create-from-prose") {
      return handleCreateFromProseMode(body as Record<string, unknown>, payload.orgId, boardId, planBlocksAi, org, gateCtx);
    }

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
    if (canUseFeature(org, "flux_docs", gateCtx)) {
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
      const cap = getDailyAiCallsCap(org, gateCtx);
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

    return NextResponse.json({
      ok: true,
      usedLlm,
      llmModel: usedLlm ? process.env.TOGETHER_MODEL || "meta-llama/Llama-3.3-70B-Instruct-Turbo" : undefined,
      llmProvider: usedLlm ? "together.ai" : undefined,
      ...normalized,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    );
  }
}
