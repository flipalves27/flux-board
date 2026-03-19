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
};

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

async function llmInsight(args: {
  boardName: string;
  bucketLabels: string[];
  cardSnippets: string[];
  transcript: string;
}): Promise<LlmInsightResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { insight: heuristicInsight(args.transcript), generatedWithAI: false };
  }

  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

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
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    return { insight: heuristicInsight(args.transcript), generatedWithAI: false };
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content || "{}";
  try {
    return {
      insight: safeInsight(JSON.parse(content)),
      generatedWithAI: true,
      model,
    };
  } catch {
    return { insight: heuristicInsight(args.transcript), generatedWithAI: false };
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
      },
    };
    const dailyInsights = [entry, ...current].slice(0, 20);
    await updateBoard(boardId, { dailyInsights });

    return NextResponse.json({ ok: true, entry });
  } catch (err) {
    console.error("Daily insights API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 500 }
    );
  }
}
