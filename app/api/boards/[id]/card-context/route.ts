import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { callTogetherApi } from "@/lib/llm-utils";
import { getBoard, getBoardRebornId, userCanAccessBoard } from "@/lib/kv-boards";
import { CardContextInputSchema, sanitizeText, zodErrorToMessage } from "@/lib/schemas";
import { guardUserPromptForLlm } from "@/lib/prompt-guard";
import { getOrganizationById } from "@/lib/kv-organizations";
import {
  assertFeatureAllowed,
  getDailyAiCallsCap,
  getDailyAiCallsWindowMs,
  makeDailyAiCallsRateLimitKey,
  planGateCtxForAuth,
  PlanGateError,
} from "@/lib/plan-gates";
import { rateLimit } from "@/lib/rate-limit";

type CardContextInput = {
  title?: string;
  description?: string;
  forceRefresh?: boolean;
};

type CardContextResult = {
  titulo: string;
  descricao: string;
  resumoNegocio: string;
  objetivo: string;
};

type LlmCardContextResult = CardContextResult & {
  generatedWithAI: boolean;
  model?: string;
  provider?: string;
  rawContent?: string;
  errorKind?: "no_api_key" | "no_model" | "http_error" | "network_error" | "parse_error" | "plan_blocked";
  errorMessage?: string;
};

type CardContextDebug = {
  source: "ai" | "heuristic" | "cache";
  cacheHit: boolean;
  durationMs: number;
  provider?: string;
  model?: string;
  errorKind?: LlmCardContextResult["errorKind"];
  errorMessage?: string;
};

const CARD_CONTEXT_LIMITS = {
  titleMaxChars: 180,
  descriptionMaxChars: 6000,
  cacheTtlMs: 5 * 60 * 1000,
  // Limita crescimento do cache em memória do servidor.
  maxEntries: 300,
} as const;

const cardContextCache = new Map<
  string,
  { expiresAt: number; result: LlmCardContextResult; createdAt: number }
>();

// Deduplica chamadas concorrentes para o mesmo cacheKey (evita múltiplos requests à IA).
const cardContextInFlight = new Map<string, Promise<LlmCardContextResult>>();

function limitToWords(text: string, maxWords: number): string {
  const words = String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  return words.slice(0, maxWords).join(" ").trim();
}

function extractFirstSentence(text: string): string {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  const match = normalized.match(/^(.+?[.!?])(\s|$)/);
  return (match?.[1] || normalized).trim();
}

function safeCardContext(raw: unknown): CardContextResult {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const tituloRaw = String(obj.titulo || "").trim();
  const descricaoRaw = String(obj.descricao || "").trim();
  const resumoNegocioRaw = String(obj.resumoNegocio || "").trim();
  const objetivoRaw = String(obj.objetivo || "").trim();

  return {
    titulo: limitToWords(tituloRaw || "Novo card", 9),
    resumoNegocio: resumoNegocioRaw.slice(0, 700) || "Resumo de negócio não disponível.",
    objetivo: objetivoRaw.slice(0, 300) || extractFirstSentence(descricaoRaw).slice(0, 300) || "Definir objetivo com base na descrição.",
    descricao: descricaoRaw.slice(0, 6000) || "Descrição não disponível.",
  };
}

function heuristicCardContext(title: string, description: string): CardContextResult {
  const t = String(title || "").trim();
  const d = String(description || "").trim();

  const firstSentence = extractFirstSentence(d);
  const words = t ? limitToWords(t, 9) : "Novo card";
  const resumo = d.length > 600 ? `${d.slice(0, 600)}...` : d;

  const objective = firstSentence
    ? limitToWords(firstSentence.replace(/^(-\s*)/g, ""), 35)
    : "Definir objetivo e critérios de pronto para o card.";

  const descricao = [
    "Contexto/Negócio:",
    resumo,
    "",
    "Objetivo:",
    objective,
    "",
    "Escopo e especificação (com base no que foi informado):",
    d,
    "",
    "Critérios de pronto (sugestão):",
    "- Requisitos técnicos e funcionais descritos com clareza e alinhados ao objetivo.",
    "- Escopo do que será entregue definido (o que entra e o que não entra).",
    "- Critérios de aceite indicados em linguagem verificável.",
    "- Premissas, dependências e riscos mapeados para execução com o time.",
  ].join("\n");

  return {
    titulo: limitToWords(words, 9),
    descricao: descricao.slice(0, 6000),
    resumoNegocio: resumo.slice(0, 700),
    objetivo: objective.slice(0, 300),
  };
}

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

  // Eviccao simples por idade (mais antigo sai primeiro).
  if (cardContextCache.size > CARD_CONTEXT_LIMITS.maxEntries) {
    const entries = [...cardContextCache.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
    const over = entries.length - CARD_CONTEXT_LIMITS.maxEntries;
    for (let i = 0; i < over; i++) {
      cardContextCache.delete(entries[i][0]);
    }
  }
}

function sanitizeJsonCandidate(value: string): string {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/,\s*([}\]])/g, "$1")
    .trim();
}

function extractBalancedJsonObject(value: string): string | null {
  const input = String(value || "");
  const start = input.indexOf("{");
  if (start < 0) return null;
  let inString = false;
  let escaped = false;
  let depth = 0;
  for (let i = start; i < input.length; i++) {
    const ch = input[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return input.slice(start, i + 1).trim();
    }
  }
  return null;
}

function parseJsonFromLlmContent(raw: string): { parsed: unknown; recovered: boolean } {
  const direct = raw?.trim();
  if (!direct) return { parsed: {}, recovered: false };
  try {
    const candidate = JSON.parse(direct);
    return { parsed: candidate, recovered: false };
  } catch {
    // Continua para estratégias de recuperação.
  }

  const sanitized = sanitizeJsonCandidate(raw);
  try {
    const candidate = JSON.parse(sanitized);
    return { parsed: candidate, recovered: true };
  } catch {
    // Continua para extração por objeto balanceado.
  }

  const balanced = extractBalancedJsonObject(raw);
  if (balanced) {
    try {
      const candidate = JSON.parse(sanitizeJsonCandidate(balanced));
      return { parsed: candidate, recovered: true };
    } catch {
      // Continua para fallback abaixo.
    }
  }

  // Última linha de defesa: tenta remover tudo que não pareça JSON.
  const maybe = raw.match(/\{[\s\S]*\}/)?.[0];
  if (maybe) {
    try {
      const candidate = JSON.parse(sanitizeJsonCandidate(maybe));
      return { parsed: candidate, recovered: true };
    } catch {
      // ignore
    }
  }

  return { parsed: {}, recovered: true };
}

async function llmCardContext(args: { boardName: string; title: string; description: string }): Promise<LlmCardContextResult> {
  const apiKey = process.env.TOGETHER_API_KEY;
  if (!apiKey) {
    const heuristic = heuristicCardContext(args.title, args.description);
    return {
      ...heuristic,
      generatedWithAI: false,
      provider: "together.ai",
      errorKind: "no_api_key",
      errorMessage: "TOGETHER_API_KEY não configurada. Usando modo heurístico.",
    };
  }

  const baseUrl = (process.env.TOGETHER_BASE_URL || "https://api.together.xyz/v1").replace(/\/+$/, "");
  const model = process.env.TOGETHER_MODEL;
  if (!model) {
    const heuristic = heuristicCardContext(args.title, args.description);
    return {
      ...heuristic,
      generatedWithAI: false,
      provider: "together.ai",
      errorKind: "no_model",
      errorMessage: "TOGETHER_MODEL não configurada. Defina no ambiente. Usando modo heurístico.",
    };
  }

  const prompt = [
    "Você é um PM técnico sênior.",
    "Recebe um título e uma descrição de card de um board.",
    "Retorne JSON puro com as chaves: titulo, descricao, resumoNegocio, objetivo.",
    "Regras e formato:",
    "- titulo: máximo de 9 palavras, curto e direto, orientado a negócio.",
    "- resumoNegocio: resumo executivo (máximo 6 linhas) para stakeholders.",
    "- objetivo: 1-3 frases claras sobre o que se pretende alcançar.",
    "- descricao: texto tecnico e de negocio para virar a descricao do card. Deve conter, nesta ordem e com estes titulos exatos seguidos de dois pontos:",
    "  1) Contexto/Negócio",
    "  2) Objetivo",
    "  3) Escopo",
    "  4) Critérios de Sucesso",
    "  5) Observações",
    "- Em Escopo, detalhe o que entra e o que nao entra na entrega.",
    "- Em Critérios de Sucesso, use bullets verificaveis de aceite/validacao.",
    "- Em Observações, inclua premissas, dependencias e riscos (bullets).",
    "- Linguagem: portuguesa, clara, objetiva e técnica.",
    "- Não inclua nenhum texto fora do JSON.",
    "",
    `Board: ${args.boardName}`,
    "",
    `Título (informado): ${args.title}`,
    `Descrição (informada):`,
    args.description.slice(0, 6000),
  ].join("\n");

  try {
    const response = await callTogetherApi(
      {
        model,
        temperature: 0.25,
        messages: [{ role: "user", content: prompt }],
      },
      { apiKey, baseUrl }
    );

    if (!response.ok) {
      const errorBody = response.bodySnippet || "";
      const message = `HTTP ${response.status ?? "?"}${errorBody ? ` - ${errorBody.slice(0, 400)}` : ""}`;
      const heuristic = heuristicCardContext(args.title, args.description);
      return {
        ...heuristic,
        generatedWithAI: false,
        model,
        provider: "together.ai",
        errorKind: "http_error",
        errorMessage: message,
      };
    }

    const content = response.assistantText || "{}";
    const parsed = parseJsonFromLlmContent(content);

    const heuristic = heuristicCardContext(args.title, args.description);
    const parsedObj = (parsed.parsed && typeof parsed.parsed === "object" ? parsed.parsed : {}) as Record<
      string,
      unknown
    >;
    const hasTitulo = Boolean(String(parsedObj.titulo || "").trim());
    const hasDescricao = Boolean(String(parsedObj.descricao || "").trim());

    const safe = safeCardContext(parsed.parsed);
    const final = hasTitulo && hasDescricao ? safe : heuristic;

    return {
      ...final,
      generatedWithAI: hasTitulo && hasDescricao,
      model,
      provider: "together.ai",
      rawContent: content,
      errorKind: hasTitulo && hasDescricao ? undefined : "parse_error",
      errorMessage:
        hasTitulo && hasDescricao
          ? undefined
          : "Resposta da IA incompleta; usando fallback estruturado.",
    };
  } catch (err) {
    const heuristic = heuristicCardContext(args.title, args.description);
    return {
      ...heuristic,
      generatedWithAI: false,
      provider: "together.ai",
      model,
      errorKind: "network_error",
      errorMessage: err instanceof Error ? err.message : "Erro de rede ao chamar a IA.",
    };
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
  const gateCtx = planGateCtxForAuth(payload.isAdmin);
  let planBlocksAiContext = false;
  try {
    assertFeatureAllowed(org, "card_context", gateCtx);
  } catch (err) {
    if (err instanceof PlanGateError) {
      // Em vez de bloquear com 403, seguimos com fallback heurístico.
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
    windowMs: 60 * 60 * 1000, // 1 hora
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
      // Conta quota de calls/dia apenas quando vamos efetivamente disparar uma chamada IA
      // (cache miss / forceRefresh) e quando Together está configurado.
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
        const res = await llmCardContext({ boardName, title, description });
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

