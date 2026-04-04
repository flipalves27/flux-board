import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import {
  CARD_CONTEXT_LIMITS,
  heuristicCardContext,
  llmStructuredCardContext,
  type LlmCardContextResult,
} from "@/lib/card-context-llm";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { CardContextInputSchema, sanitizeText, zodErrorToMessage } from "@/lib/schemas";
import { guardUserPromptForLlm } from "@/lib/prompt-guard";
import { getOrganizationById } from "@/lib/kv-organizations";
import {
  assertFeatureAllowed,
  getDailyAiCallsCap,
  getDailyAiCallsWindowMs,
  makeDailyAiCallsRateLimitKey,
  planGateCtxFromAuthPayload,
  PlanGateError,
} from "@/lib/plan-gates";
import { rateLimit } from "@/lib/rate-limit";

type CardContextDebug = {
  source: "ai" | "heuristic" | "cache";
  cacheHit: boolean;
  durationMs: number;
  provider?: string;
  model?: string;
  errorKind?: LlmCardContextResult["errorKind"];
  errorMessage?: string;
};

const cardContextCache = new Map<
  string,
  { expiresAt: number; result: LlmCardContextResult; createdAt: number }
>();

const cardContextInFlight = new Map<string, Promise<LlmCardContextResult>>();

function normalizeInputValue(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function makeCacheKey(args: { boardId: string; boardName: string; title: string; description: string }): string {
  return JSON.stringify({
    boardId: args.boardId,
    boardName: normalizeInputValue(args.boardName).toLowerCase(),
    title: normalizeInputValue(args.title).toLowerCase(),
    description: normalizeInputValue(args.description).toLowerCase(),
  });
}

function readCachedContext(cacheKey: string): LlmCardContextResult | null {
  const hit = cardContextCache.get(cacheKey);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    cardContextCache.delete(cacheKey);
    return null;
  }
  return hit.result;
}

function writeCachedContext(cacheKey: string, result: LlmCardContextResult): void {
  cardContextCache.set(cacheKey, {
    expiresAt: Date.now() + CARD_CONTEXT_LIMITS.cacheTtlMs,
    createdAt: Date.now(),
    result,
  });

  if (cardContextCache.size > CARD_CONTEXT_LIMITS.maxEntries) {
    const entries = [...cardContextCache.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
    const over = entries.length - CARD_CONTEXT_LIMITS.maxEntries;
    for (let i = 0; i < over; i++) {
      cardContextCache.delete(entries[i][0]);
    }
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
  let planBlocksAiContext = false;
  try {
    assertFeatureAllowed(org, "card_context", gateCtx);
  } catch (err) {
    if (err instanceof PlanGateError) {
      planBlocksAiContext = true;
    } else {
      throw err;
    }
  }

  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) {
    return NextResponse.json({ error: "Sem permissão para este board" }, { status: 403 });
  }

  const rl = await rateLimit({
    key: `boards:card-context:user:${payload.id}`,
    limit: 30,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) {
    console.warn("[rate-limit] blocked card-context", { userId: payload.id, retryAfterSeconds: rl.retryAfterSeconds });
    return NextResponse.json(
      { error: "Muitas requisições. Tente novamente mais tarde." },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSeconds) },
      }
    );
  }

  try {
    const body = await request.json();
    const parsed = CardContextInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });
    }

    const title = guardUserPromptForLlm(sanitizeText(parsed.data.title).trim()).text;
    const description = guardUserPromptForLlm(sanitizeText(parsed.data.description).trim()).text;
    const forceRefresh = Boolean(parsed.data.forceRefresh);

    if (!title || !description) {
      return NextResponse.json({ error: "Título e descrição são obrigatórios." }, { status: 400 });
    }
    if (title.length > CARD_CONTEXT_LIMITS.titleMaxChars) {
      return NextResponse.json(
        { error: `Título excede o limite de ${CARD_CONTEXT_LIMITS.titleMaxChars} caracteres.` },
        { status: 400 }
      );
    }
    if (description.length > CARD_CONTEXT_LIMITS.descriptionMaxChars) {
      return NextResponse.json(
        { error: `Descrição excede o limite de ${CARD_CONTEXT_LIMITS.descriptionMaxChars} caracteres.` },
        { status: 400 }
      );
    }

    const board = await getBoard(boardId, payload.orgId);
    const boardName = board?.name || "Board";
    const cacheKey = makeCacheKey({ boardId, boardName, title, description });
    const startedAt = Date.now();

    if (!forceRefresh) {
      const cached = readCachedContext(cacheKey);
      if (cached) {
        const source: CardContextDebug["source"] = cached.generatedWithAI ? "ai" : "heuristic";
        return NextResponse.json({
          ok: true,
          titulo: cached.titulo,
          descricao: cached.descricao,
          resumoNegocio: cached.resumoNegocio,
          objetivo: cached.objetivo,
          generatedWithAI: cached.generatedWithAI,
          provider: cached.provider,
          model: cached.model,
          llmDebug: {
            source: "cache",
            generatedWithAI: cached.generatedWithAI,
            provider: cached.provider,
            model: cached.model,
            errorKind: cached.errorKind,
            errorMessage: cached.errorMessage,
            cacheHit: true,
            durationMs: Date.now() - startedAt,
            cachedSource: source,
          },
        });
      }
    }

    if (planBlocksAiContext) {
      const fallback = heuristicCardContext(title, description);
      const result: LlmCardContextResult = {
        ...fallback,
        generatedWithAI: false,
        provider: "together.ai",
        errorKind: "plan_blocked",
        errorMessage: "Plano atual sem acesso ao recurso de IA completo. Aplicado fallback estruturado.",
      };
      writeCachedContext(cacheKey, result);
      return NextResponse.json({
        ok: true,
        titulo: result.titulo,
        descricao: result.descricao,
        resumoNegocio: result.resumoNegocio,
        objetivo: result.objetivo,
        generatedWithAI: false,
        provider: result.provider,
        model: result.model,
        llmDebug: {
          source: "heuristic",
          generatedWithAI: false,
          provider: result.provider,
          model: result.model,
          errorKind: result.errorKind,
          errorMessage: result.errorMessage,
          cacheHit: false,
          durationMs: Date.now() - startedAt,
        },
      });
    }

    let inFlight = cardContextInFlight.get(cacheKey);
    if (!inFlight) {
      const cap = getDailyAiCallsCap(org, gateCtx);
      const togetherEnabled = Boolean(process.env.TOGETHER_API_KEY) && Boolean(process.env.TOGETHER_MODEL);
      if (cap !== null && togetherEnabled) {
        const dailyKey = makeDailyAiCallsRateLimitKey(payload.orgId);
        const rlDaily = await rateLimit({
          key: dailyKey,
          limit: cap,
          windowMs: getDailyAiCallsWindowMs(),
        });
        if (!rlDaily.allowed) {
          return NextResponse.json(
            { error: "Limite diário de chamadas de IA atingido. Faça upgrade no Stripe." },
            { status: 403 }
          );
        }
      }

      inFlight = (async () => {
        const res = await llmStructuredCardContext({ boardName, title, description });
        writeCachedContext(cacheKey, res);
        return res;
      })().finally(() => {
        cardContextInFlight.delete(cacheKey);
      });
      cardContextInFlight.set(cacheKey, inFlight);
    }

    const result = await inFlight;
    const debug: CardContextDebug = {
      source: result.generatedWithAI ? "ai" : "heuristic",
      cacheHit: false,
      durationMs: Date.now() - startedAt,
      provider: result.provider,
      model: result.model,
      errorKind: result.errorKind,
      errorMessage: result.errorMessage,
    };

    return NextResponse.json({
      ok: true,
      titulo: result.titulo,
      descricao: result.descricao,
      resumoNegocio: result.resumoNegocio,
      objetivo: result.objetivo,
      generatedWithAI: result.generatedWithAI,
      provider: result.provider,
      model: result.model,
      llmDebug: {
        source: debug.source,
        generatedWithAI: result.generatedWithAI,
        provider: result.provider,
        model: result.model,
        errorKind: result.errorKind,
        errorMessage: result.errorMessage,
        cacheHit: debug.cacheHit,
        durationMs: debug.durationMs,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    );
  }
}
