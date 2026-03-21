import type { BoardData } from "@/lib/kv-boards";
import { callTogetherApi, safeJsonParse } from "@/lib/llm-utils";
import type { CopilotChatDocLike } from "@/lib/weekly-digest-metrics";
import {
  collectCardIdsFromDateFieldsInWindow,
  collectCardIdsTouchedInCopilotWindow,
} from "@/lib/weekly-digest-metrics";

export type SentimentCategory = "positive" | "neutral" | "negative";
export type SentimentTrend = "up" | "down" | "flat";

export type BoardWeeklySentimentResult = {
  score: number;
  category: SentimentCategory;
  trend: SentimentTrend;
  trendDelta: number | null;
  signalExamples: string[];
  emoji: string;
  generatedWithAI: boolean;
  model?: string;
  provider?: string;
  errorKind?: string;
  errorMessage?: string;
};

const MAX_CORPUS_CHARS = 12000;
const MAX_CARD_SNIPPETS = 24;
const MAX_DAILY_SNIPPETS = 6;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function emojiForCategory(c: SentimentCategory): string {
  if (c === "positive") return "🙂";
  if (c === "negative") return "😟";
  return "😐";
}

function categoryFromScore(score: number): SentimentCategory {
  if (score >= 62) return "positive";
  if (score <= 38) return "negative";
  return "neutral";
}

function trendFromDelta(delta: number | null): SentimentTrend {
  if (delta === null || Number.isNaN(delta)) return "flat";
  if (delta > 2) return "up";
  if (delta < -2) return "down";
  return "flat";
}

function flattenDailyInsightText(insight: unknown): string {
  if (!insight || typeof insight !== "object") return "";
  const o = insight as Record<string, unknown>;
  const parts: string[] = [];
  const push = (s: unknown) => {
    if (typeof s === "string" && s.trim()) parts.push(s.trim());
  };
  push(o.resumo);
  push(o.contextoOrganizado);
  const lists = ["criar", "ajustar", "corrigir", "pendencias"] as const;
  for (const k of lists) {
    const arr = o[k];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      if (typeof item === "string") push(item);
      else if (item && typeof item === "object") {
        const it = item as Record<string, unknown>;
        push(it.titulo);
        push(it.descricao);
      }
    }
  }
  return parts.join("\n");
}

function collectDailyInsightTextsForWeek(board: BoardData, range: { startMs: number; endMs: number }): string[] {
  const out: string[] = [];
  const daily = Array.isArray(board.dailyInsights) ? board.dailyInsights : [];
  for (const e of daily) {
    if (!e || typeof e !== "object") continue;
    const createdRaw = (e as { createdAt?: string }).createdAt;
    if (!createdRaw || typeof createdRaw !== "string") continue;
    const ts = new Date(createdRaw.trim()).getTime();
    if (Number.isNaN(ts) || ts < range.startMs || ts >= range.endMs) continue;
    const tr = typeof (e as { transcript?: string }).transcript === "string" ? (e as { transcript: string }).transcript : "";
    const insightTxt = flattenDailyInsightText((e as { insight?: unknown }).insight);
    const block = [tr.trim(), insightTxt].filter(Boolean).join("\n");
    if (block) out.push(block.slice(0, 4000));
    if (out.length >= MAX_DAILY_SNIPPETS) break;
  }
  return out;
}

function mergeCardIdSets(board: BoardData, weekRange: { startMs: number; endMs: number }, copilotChats: CopilotChatDocLike[], boardId: string): Set<string> {
  const a = collectCardIdsTouchedInCopilotWindow({ boardId, copilotChats, range: weekRange });
  const b = collectCardIdsFromDateFieldsInWindow(board, weekRange);
  for (const id of b) a.add(id);
  return a;
}

function cardSnippetsForIds(board: BoardData, ids: Set<string>): string[] {
  const cards = Array.isArray(board.cards) ? board.cards : [];
  const out: string[] = [];
  for (const c of cards) {
    if (!c || typeof c !== "object") continue;
    const id = String((c as { id?: string }).id);
    if (!id || !ids.has(id)) continue;
    const title = typeof (c as { title?: string }).title === "string" ? (c as { title: string }).title : "";
    const desc = typeof (c as { desc?: string }).desc === "string" ? (c as { desc: string }).desc : "";
    const line = `${title.trim()}${desc.trim() ? `\n${desc.trim().slice(0, 900)}` : ""}`.trim();
    if (line) out.push(line);
    if (out.length >= MAX_CARD_SNIPPETS) break;
  }
  return out;
}

export function buildWeeklySentimentCorpus(args: {
  board: BoardData;
  boardId: string;
  weekRange: { startMs: number; endMs: number };
  copilotChats: CopilotChatDocLike[];
}): { corpus: string; cardIdsCount: number; dailySnippetCount: number } {
  const ids = mergeCardIdSets(args.board, args.weekRange, args.copilotChats, args.boardId);
  const cardSnippets = cardSnippetsForIds(args.board, ids);
  const dailyTexts = collectDailyInsightTextsForWeek(args.board, args.weekRange);

  const parts = [
    "=== Cards (título + descrição, sem autores) ===",
    ...cardSnippets.map((s, i) => `(${i + 1}) ${s}`),
    "",
    "=== Daily Insights (trechos da semana) ===",
    ...dailyTexts.map((s, i) => `(${i + 1}) ${s}`),
  ];

  let corpus = parts.join("\n").trim();
  if (corpus.length > MAX_CORPUS_CHARS) corpus = corpus.slice(0, MAX_CORPUS_CHARS);
  return {
    corpus,
    cardIdsCount: ids.size,
    dailySnippetCount: dailyTexts.length,
  };
}

const HEUR_POS = [
  /\b(entregue|conclu[íi]do|resolvido|finalmente|no prazo|progresso|avançamos|conseguimos)\b/i,
  /\b(obrigad|celebr|sucesso|meta batida)\b/i,
];
const HEUR_NEG = [
  /\b(bloquead|bloqueio|impedimento|esperando|atraso|frustra|risco|não vamos|dependência externa|incerteza|burnout)\b/i,
  /\b(semanas?\s+sem|sem resposta|urgente|cr[ií]tico)\b/i,
];

function heuristicSentiment(args: { corpus: string; previousScore: number | null }): Omit<BoardWeeklySentimentResult, "generatedWithAI" | "model" | "provider" | "errorKind" | "errorMessage"> {
  const text = args.corpus.toLowerCase();
  let pos = 0;
  let neg = 0;
  for (const re of HEUR_POS) pos += re.test(text) ? 1 : 0;
  for (const re of HEUR_NEG) neg += re.test(text) ? 1 : 0;

  const base = 50 + pos * 12 - neg * 14;
  if (!args.corpus.trim()) {
    const score = clamp(args.previousScore ?? 55, 0, 100);
    const delta = args.previousScore !== null ? score - args.previousScore : null;
    return {
      score,
      category: categoryFromScore(score),
      trend: trendFromDelta(delta),
      trendDelta: delta,
      signalExamples: ["Poucos sinais textuais na semana; o score reflete o estado neutro ou a semana anterior."],
      emoji: emojiForCategory(categoryFromScore(score)),
    };
  }

  const score = clamp(base, 0, 100);
  const cat = categoryFromScore(score);
  const examples: string[] = [];
  const pushMatch = (label: string, re: RegExp) => {
    const m = args.corpus.match(re);
    if (m && examples.length < 3) examples.push(`${label}: ${m[0].slice(0, 72)}`);
  };
  for (const re of HEUR_NEG) {
    if (examples.length >= 2) break;
    pushMatch("Sinal tensão", re);
  }
  for (const re of HEUR_POS) {
    if (examples.length >= 3) break;
    pushMatch("Sinal positivo", re);
  }
  if (examples.length === 0) {
    examples.push("Operação sem frases marcantes; monitore bloqueios e dependências nas próximas semanas.");
  } else if (examples.length === 1) {
    examples.push("Sem polarização forte nos textos analisados.");
  }

  let delta: number | null = null;
  if (args.previousScore !== null) delta = score - args.previousScore;

  return {
    score,
    category: cat,
    trend: trendFromDelta(delta),
    trendDelta: delta,
    signalExamples: examples.slice(0, 3),
    emoji: emojiForCategory(cat),
  };
}

export async function generateBoardWeeklySentimentAI(args: {
  boardName: string;
  corpus: string;
  previousWeekScore: number | null;
  allowAI?: boolean;
}): Promise<BoardWeeklySentimentResult> {
  const { boardName, corpus, previousWeekScore, allowAI } = args;

  const cap = process.env.WEEKLY_DIGEST_AI_CAP;
  const togetherEnabled = Boolean(process.env.TOGETHER_API_KEY) && Boolean(process.env.TOGETHER_MODEL);
  const apiKey = process.env.TOGETHER_API_KEY;
  const model = process.env.TOGETHER_MODEL;

  const fallback = (): BoardWeeklySentimentResult => {
    const h = heuristicSentiment({ corpus, previousScore: previousWeekScore });
    return { ...h, generatedWithAI: false, provider: "together.ai" };
  };

  if (!allowAI || !togetherEnabled || !apiKey || !model || (cap && Number(cap) === 0)) {
    const h = heuristicSentiment({ corpus, previousScore: previousWeekScore });
    return { ...h, generatedWithAI: false, provider: "together.ai" };
  }

  const prevHint =
    previousWeekScore === null ? "Semana anterior: sem baseline registrado." : `Semana anterior: score ${previousWeekScore}/100.`;

  const prompt = [
    "Você analisa clima emocional de trabalho em equipe a partir de texto agregado de um board Kanban.",
    "Privacidade: não há identificação de pessoas; não invente nomes nem cite autores. Analise em lote.",
    "Retorne JSON puro e somente o JSON (sem markdown).",
    "Formato JSON:",
    '{ "score": number, "category": "positive"|"neutral"|"negative", "signalExamples": string[] }',
    "",
    "Regras:",
    "- score: inteiro 0–100 (0 = muito negativo/risco, 50 = neutro, 100 = positivo/progresso saudável).",
    "- category: positivo (progresso saudável), neutro (operação normal), negativo (frustração, bloqueio, risco).",
    "- signalExamples: 2 a 3 frases curtas (máx. 90 caracteres cada) descrevendo o tipo de sinal encontrado (ex.: menção a bloqueio externo prolongado). Não copie texto literal longo; generalize sem atribuir a indivíduos.",
    "",
    `Board: ${boardName}`,
    prevHint,
    "",
    "Texto agregado:",
    corpus.trim() || "(vazio)",
  ].join("\n");

  const baseUrl = (process.env.TOGETHER_BASE_URL || "https://api.together.xyz/v1").replace(/\/+$/, "");

  try {
    const response = await callTogetherApi(
      {
        model,
        temperature: 0.15,
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      },
      { apiKey, baseUrl }
    );

    if (!response.ok) {
      const h = fallback();
      return {
        ...h,
        errorKind: "http_error",
        errorMessage: `HTTP ${response.status ?? "?"} ${response.bodySnippet || response.error}`,
      };
    }

    const raw = response.assistantText || "";
    const parsed = safeJsonParse(raw);
    const obj = parsed && typeof parsed === "object" ? (parsed as any) : null;

    if (!obj || typeof obj.score !== "number" || typeof obj.category !== "string") {
      const h = fallback();
      return {
        ...h,
        errorKind: "bad_json",
        errorMessage: "Resposta da IA não estava no formato esperado.",
      };
    }

    let score = Math.round(Number(obj.score));
    if (!Number.isFinite(score)) score = 55;
    score = clamp(score, 0, 100);

    const catRaw = String(obj.category).toLowerCase().trim();
    const category: SentimentCategory =
      catRaw === "negative" || catRaw === "negativo"
        ? "negative"
        : catRaw === "positive" || catRaw === "positivo"
          ? "positive"
          : "neutral";

    const examples = Array.isArray(obj.signalExamples)
      ? obj.signalExamples
          .map((x: any) => (typeof x === "string" ? x.trim().slice(0, 120) : ""))
          .filter(Boolean)
          .slice(0, 3)
      : [];

    const safeExamples = examples.length ? examples : heuristicSentiment({ corpus, previousScore: previousWeekScore }).signalExamples;

    let trendDelta: number | null = null;
    if (previousWeekScore !== null) trendDelta = score - previousWeekScore;

    return {
      score,
      category,
      trend: trendFromDelta(trendDelta),
      trendDelta,
      signalExamples: safeExamples.slice(0, 3),
      emoji: emojiForCategory(category),
      generatedWithAI: true,
      model,
      provider: "together.ai",
    };
  } catch (err) {
    const h = fallback();
    return {
      ...h,
      errorKind: "network_error",
      errorMessage: err instanceof Error ? err.message : "Erro de rede ao chamar a IA.",
    };
  }
}
