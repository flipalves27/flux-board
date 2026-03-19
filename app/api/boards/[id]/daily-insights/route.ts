import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, updateBoard, userCanAccessBoard } from "@/lib/kv-boards";

type InsightResult = {
  resumo: string;
  criar: string[];
  criarDetalhes: Array<{
    titulo: string;
    prioridade: string;
    progresso: string;
    coluna?: string;
  }>;
  ajustar: string[];
  corrigir: string[];
  pendencias: string[];
};

function normalizeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 20);
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
      const prioridade = String(rec.prioridade || "Média").trim() || "Média";
      const progresso = String(rec.progresso || "Não iniciado").trim() || "Não iniciado";
      const coluna = String(rec.coluna || "").trim();
      return { titulo, prioridade, progresso, coluna: coluna || undefined };
    })
    .filter(Boolean) as InsightResult["criarDetalhes"];

  const mergedCriarDetalhes =
    criarDetalhes.length > 0
      ? criarDetalhes.slice(0, 20)
      : criar.slice(0, 20).map((titulo) => ({
          titulo,
          prioridade: "Média",
          progresso: "Não iniciado",
        }));

  return {
    resumo: String(obj.resumo || "Resumo não disponível.").trim(),
    criar,
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

  return {
    resumo,
    criar,
    criarDetalhes: criar.slice(0, 20).map((titulo) => ({
      titulo,
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
}): Promise<InsightResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return heuristicInsight(args.transcript);

  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const prompt = [
    "Você é um PM técnico sênior.",
    "Recebe uma transcrição de daily e contexto de board.",
    "Retorne JSON puro com as chaves: resumo, criar, criarDetalhes, ajustar, corrigir, pendencias.",
    "criarDetalhes deve ser uma lista de objetos com: titulo, prioridade, progresso, coluna(opcional).",
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
    return heuristicInsight(args.transcript);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content || "{}";
  try {
    return safeInsight(JSON.parse(content));
  } catch {
    return heuristicInsight(args.transcript);
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
    const body = (await request.json()) as { transcript?: string };
    const transcript = String(body.transcript || "").trim();
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

    const insight = await llmInsight({
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
      insight,
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
