import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, updateBoard, userCanAccessBoard } from "@/lib/kv-boards";

type InsightResult = {
  resumo: string;
  contextoOrganizado: string;
  criar: string[];
  criarDetalhes: Array<{
    titulo: string;
    descricao: string;
    prioridade: string;
    progresso: string;
    coluna?: string;
    tags?: string[];
    dataConclusao?: string;
    direcionamento?: string;
  }>;
  ajustar: string[];
  corrigir: string[];
  pendencias: string[];
};

type LlmInsightResult = {
  insight: InsightResult;
  generatedWithAI: boolean;
  model?: string;
  provider?: string;
  // Campos auxiliares para log de conectividade com IA (expostos apenas na resposta HTTP)
  rawContent?: string;
  errorKind?: "no_api_key" | "http_error" | "network_error" | "parse_error";
  errorMessage?: string;
};

type ParseOutcome = {
  parsed: unknown;
  recovered: boolean;
};

function extractTextFromLlmContent(
  content: string | Array<{ type?: string; text?: string }> | undefined
): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      return String(part.text || "").trim();
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function normalizeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 20);
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 6);
}

function safeInsight(raw: unknown): InsightResult {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const criar = normalizeList(obj.criar);
  const criarDetalhesRaw = Array.isArray(obj.criarDetalhes) ? obj.criarDetalhes : [];
  const criarDetalhes = criarDetalhesRaw
    .map((item) => {
      const rec = item && typeof item === "object" ? (item as Record<string, unknown>) : null;
      if (!rec) return null;
      const titulo = String(rec.titulo || "").trim();
      if (!titulo) return null;
      const descricao = String(rec.descricao || rec.detalhes || "").trim();
      const prioridade = String(rec.prioridade || "Média").trim() || "Média";
      const progresso = String(rec.progresso || "Não iniciado").trim() || "Não iniciado";
      const coluna = String(rec.coluna || "").trim();
      const tags = normalizeTags(rec.tags);
      const dataConclusao = String(rec.dataConclusao || "").trim();
      const direcionamento = String(rec.direcionamento || "").trim();
      return {
        titulo: titulo.slice(0, 120),
        descricao: descricao.slice(0, 1600),
        prioridade,
        progresso,
        coluna: coluna || undefined,
        tags,
        dataConclusao: dataConclusao || undefined,
        direcionamento: direcionamento || undefined,
      };
    })
    .filter(Boolean) as InsightResult["criarDetalhes"];

  const mergedCriarDetalhes =
    criarDetalhes.length > 0
      ? criarDetalhes.slice(0, 20)
      : criar.slice(0, 20).map((titulo) => ({
          titulo,
          descricao: "Detalhar escopo, impacto e critérios de aceite com o time.",
          prioridade: "Média",
          progresso: "Não iniciado",
        }));

  return {
    resumo: String(obj.resumo || "Resumo não disponível.").trim(),
    contextoOrganizado: String(obj.contextoOrganizado || obj.resumo || "Contexto organizado não disponível.")
      .trim()
      .slice(0, 12000),
    criar: criar.length ? criar : mergedCriarDetalhes.map((item) => item.titulo),
    criarDetalhes: mergedCriarDetalhes,
    ajustar: normalizeList(obj.ajustar),
    corrigir: normalizeList(obj.corrigir),
    pendencias: normalizeList(obj.pendencias),
  };
}

function heuristicInsight(transcript: string): InsightResult {
  const lines = transcript
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 200);

  const lower = (s: string) => s.toLowerCase();
  const pick = (keywords: string[]) =>
    lines.filter((line) => keywords.some((k) => lower(line).includes(k))).slice(0, 10);

  const criar = pick(["criar", "novo", "iniciar", "implementar", "abrir tarefa"]);
  const ajustar = pick(["ajustar", "refinar", "melhorar", "atualizar", "alinhar"]);
  const corrigir = pick(["corrigir", "bug", "erro", "falha", "incidente", "quebrou"]);
  const pendencias = pick(["pendente", "bloque", "aguard", "depende", "validar", "aprovar"]);

  const top = lines.slice(0, 4);
  const resumo =
    top.length > 0
      ? `Pontos centrais da daily: ${top.join(" | ").slice(0, 700)}`
      : "Não foi possível extrair pontos relevantes da transcrição.";
  const contextoOrganizado = [
    "Contexto revisado da daily",
    "",
    "Resumo executivo:",
    resumo,
    "",
    "Ações para criar:",
    ...(criar.length ? criar.map((x, i) => `${i + 1}. ${x}`) : ["- Sem itens identificados."]),
    "",
    "Ações para ajustar:",
    ...(ajustar.length ? ajustar.map((x, i) => `${i + 1}. ${x}`) : ["- Sem itens identificados."]),
    "",
    "Correções:",
    ...(corrigir.length ? corrigir.map((x, i) => `${i + 1}. ${x}`) : ["- Sem itens identificados."]),
    "",
    "Pendências e riscos:",
    ...(pendencias.length ? pendencias.map((x, i) => `${i + 1}. ${x}`) : ["- Sem itens identificados."]),
  ]
    .join("\n")
    .slice(0, 12000);

  return {
    resumo,
    contextoOrganizado,
    criar,
    criarDetalhes: criar.slice(0, 20).map((titulo) => ({
      titulo,
      descricao: "Detalhar escopo, impacto esperado e validação com stakeholders.",
      prioridade: "Média",
      progresso: "Não iniciado",
    })),
    ajustar,
    corrigir,
    pendencias,
  };
}

function sanitizeJsonCandidate(value: string): string {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    // Remove comentários estilo JS que podem vazar de respostas do modelo.
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    // Remove vírgulas finais inválidas em objetos/arrays.
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
      if (depth === 0) {
        return input.slice(start, i + 1).trim();
      }
    }
  }
  return null;
}

function objectFromRawContent(content: string): Record<string, unknown> {
  const text = String(content || "").trim();
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 60);
  const compact = lines.join(" ").slice(0, 700);
  return {
    resumo: compact || "Resposta da IA recebida sem JSON válido.",
    contextoOrganizado: text.slice(0, 12000),
    criar: [],
    criarDetalhes: [],
    ajustar: [],
    corrigir: [],
    pendencias: [],
  };
}

function parseJsonFromLlmContent(content: string): ParseOutcome {
  const raw = String(content || "").trim();
  if (!raw) return { parsed: {}, recovered: true };

  const direct = () => JSON.parse(sanitizeJsonCandidate(raw));

  const fromFence = () => {
    const fencedMatch = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (!fencedMatch) return null;
    return JSON.parse(sanitizeJsonCandidate(fencedMatch[1].trim()));
  };

  const fromBalancedObject = () => {
    const candidate = extractBalancedJsonObject(raw);
    if (!candidate) return null;
    return JSON.parse(sanitizeJsonCandidate(candidate));
  };

  try {
    return { parsed: direct(), recovered: false };
  } catch {
    // Continua para estratégias de recuperação.
  }

  try {
    const parsed = fromFence();
    if (parsed !== null) return { parsed, recovered: true };
  } catch {
    // Continua para próxima estratégia.
  }

  try {
    const parsed = fromBalancedObject();
    if (parsed !== null) return { parsed, recovered: true };
  } catch {
    // Continua para fallback textual estruturado.
  }

  // Última linha de defesa: nunca propaga parse_error para a integração.
  return { parsed: objectFromRawContent(raw), recovered: true };
}

async function llmInsight(args: {
  boardName: string;
  bucketLabels: string[];
  cardSnippets: string[];
  transcript: string;
}): Promise<LlmInsightResult> {
  // Usa exclusivamente Together.ai (TOGETHER_API_KEY obrigatório para geração via LLM)
  const apiKey = process.env.TOGETHER_API_KEY;
  if (!apiKey) {
    return {
      insight: heuristicInsight(args.transcript),
      generatedWithAI: false,
      provider: "together.ai",
      errorKind: "no_api_key",
      errorMessage: "TOGETHER_API_KEY não configurada. Usando modo heurístico.",
    };
  }

  // Endpoint OpenAI-compatível da Together.ai
  const baseUrl = (
    process.env.TOGETHER_BASE_URL || "https://api.together.xyz/v1"
  ).replace(/\/+$/, "");

  // Permite sobrescrever o modelo; default alinhado ao exemplo solicitado.
  const model = process.env.TOGETHER_MODEL || "google/gemma-3n-E4B-it";

  const prompt = [
    "Você é um PM técnico sênior.",
    "Recebe uma transcrição de daily e contexto de board.",
    "Retorne JSON puro com as chaves: resumo, contextoOrganizado, criar, criarDetalhes, ajustar, corrigir, pendencias.",
    "contextoOrganizado deve ser um texto enxuto, revisado e objetivo, estruturado em seções curtas para leitura rápida.",
    "O texto de contexto deve parecer um documento pronto para anexar ao histórico da daily.",
    "criarDetalhes deve ser uma lista de objetos com: titulo, descricao, prioridade, progresso, coluna(opcional), tags(opcional), dataConclusao(opcional), direcionamento(opcional).",
    "titulo deve ser curto e direto (máximo de 9 palavras).",
    "descricao deve ser detalhada e pronta para virar descrição do card, incluindo escopo, objetivo e critério de pronto.",
    "tags deve ser uma lista curta de rótulos existentes no board quando possível.",
    "dataConclusao deve ser ISO (YYYY-MM-DD) quando existir indicação de prazo.",
    "direcionamento deve usar apenas: manter, priorizar, adiar, cancelar, reavaliar (quando aplicável).",
    "Use apenas prioridades entre: Urgente, Importante, Média.",
    "Use apenas progresso entre: Não iniciado, Em andamento, Concluída.",
    "Cada lista deve conter itens objetivos e acionáveis, sem texto longo.",
    "Resumo em no máximo 6 linhas, português claro e direto.",
    "",
    `Board: ${args.boardName}`,
    `Colunas: ${args.bucketLabels.join(", ")}`,
    "Cards recentes/contexto:",
    ...args.cardSnippets.slice(0, 25).map((x, i) => `${i + 1}. ${x}`),
    "",
    "Transcrição da daily:",
    args.transcript.slice(0, 12000),
  ].join("\n");

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [{ role: "user", content: prompt }],
        // Não usamos response_format para manter compatibilidade ampla;
        // o prompt já obriga retorno como JSON puro.
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      const message = `HTTP ${response.status} ${response.statusText}${
        errorBody ? ` - ${errorBody.slice(0, 400)}` : ""
      }`;
      console.error("Daily insights LLM HTTP error:", message);
      return {
        insight: heuristicInsight(args.transcript),
        generatedWithAI: false,
        model,
        provider: "together.ai",
        errorKind: "http_error",
        errorMessage: message,
      };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
    };
    const content = extractTextFromLlmContent(data.choices?.[0]?.message?.content) || "{}";
    const parsed = parseJsonFromLlmContent(content);
    return {
      insight: safeInsight(parsed.parsed),
      generatedWithAI: true,
      model,
      provider: "together.ai",
      rawContent: content,
      // JSON foi recuperado localmente; não propaga erro de parse para a camada de integração.
      errorKind: undefined,
      errorMessage: parsed.recovered
        ? "JSON da IA foi tratado automaticamente antes da integração."
        : undefined,
    };
  } catch (err) {
    console.error("Daily insights LLM network error:", err);
    return {
      insight: heuristicInsight(args.transcript),
      generatedWithAI: false,
      model,
      provider: "together.ai",
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

  const { id: boardId } = await params;
  if (!boardId || boardId === "boards") {
    return NextResponse.json({ error: "ID do board é obrigatório" }, { status: 400 });
  }

  const canAccess = await userCanAccessBoard(payload.id, payload.isAdmin, boardId);
  if (!canAccess) {
    return NextResponse.json({ error: "Sem permissão para este board" }, { status: 403 });
  }

  try {
    const body = (await request.json()) as { transcript?: string; fileName?: string };
    const transcript = String(body.transcript || "").trim();
    const sourceFileName = String(body.fileName || "").trim().slice(0, 200);
    if (!transcript) {
      return NextResponse.json({ error: "Transcrição é obrigatória" }, { status: 400 });
    }

    const board = await getBoard(boardId);
    if (!board) {
      return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });
    }

    const buckets = Array.isArray(board.config?.bucketOrder) ? board.config?.bucketOrder : [];
    const bucketLabels = buckets
      .map((bucket) => {
        if (bucket && typeof bucket === "object") {
          const rec = bucket as Record<string, unknown>;
          return String(rec.label || rec.key || "");
        }
        return "";
      })
      .filter(Boolean);

    const cards = Array.isArray(board.cards) ? board.cards : [];
    const cardSnippets = cards.slice(0, 80).map((card) => {
      const rec = card as Record<string, unknown>;
      return `[${String(rec.id || "")}] ${String(rec.title || "")} | ${String(rec.progress || "")} | ${String(
        rec.bucket || ""
      )} | ${String(rec.desc || "").slice(0, 220)}`;
    });

    const llmResult = await llmInsight({
      boardName: board.name || "Board",
      bucketLabels,
      cardSnippets,
      transcript,
    });

    const now = new Date().toISOString();
    const current = Array.isArray(board.dailyInsights) ? board.dailyInsights : [];
    const entry = {
      id: `daily_${Date.now()}`,
      createdAt: now,
      transcript: transcript.slice(0, 15000),
      sourceFileName: sourceFileName || undefined,
      insight: llmResult.insight,
      generationMeta: {
        usedLlm: llmResult.generatedWithAI,
        model: llmResult.generatedWithAI ? llmResult.model : undefined,
        provider: llmResult.provider,
        errorKind: llmResult.errorKind,
      },
    };
    const dailyInsights = [entry, ...current].slice(0, 20);
    await updateBoard(boardId, { dailyInsights });

    const llmDebug = {
      provider: llmResult.provider,
      model: llmResult.model,
      generatedWithAI: llmResult.generatedWithAI,
      errorKind: llmResult.errorKind,
      errorMessage: llmResult.errorMessage,
      rawContent: llmResult.rawContent,
    };

    return NextResponse.json({ ok: true, entry, llmDebug });
  } catch (err) {
    console.error("Daily insights API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    );
  }
}
