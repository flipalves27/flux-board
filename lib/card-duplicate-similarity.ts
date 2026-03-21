import type { BoardData } from "@/lib/kv-boards";
import { cosineSimilarity } from "@/lib/embeddings-together";

/** Título normalizado para comparação e indexação leve (sem acentos, minúsculas). */
export function normalizeForDuplicateTitle(s: string): string {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const GENERIC_SINGLE_WORD_TITLES = new Set([
  "reuniao",
  "reunião",
  "bug",
  "task",
  "todo",
  "teste",
  "meeting",
  "call",
  "duvida",
  "dúvida",
  "ajuda",
  "pendencia",
  "pendência",
  "issue",
  "fix",
  "wip",
  "nova",
  "card",
  "item",
  "chamado",
  "ticket",
]);

/**
 * Evita falsos positivos em títulos muito curtos ou genéricos (ex.: "Reunião", "Bug").
 */
export function shouldSuppressDuplicateSuggestion(title: string): boolean {
  const n = normalizeForDuplicateTitle(title);
  if (n.length < 4) return true;
  const words = n.split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    if (GENERIC_SINGLE_WORD_TITLES.has(n)) return true;
    if (n.length <= 4) return true;
  }
  return false;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const row = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) row[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j];
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return row[n];
}

/** Razão 0–1 (0 = idênticos). */
export function levenshteinRatio(a: string, b: string): number {
  if (!a.length && !b.length) return 0;
  const d = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return maxLen ? d / maxLen : 0;
}

function tokenizeForBm25(s: string): string[] {
  return normalizeForDuplicateTitle(s)
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

function bucketLabelForKey(board: BoardData, key: string): string {
  const order = Array.isArray(board.config?.bucketOrder) ? board.config!.bucketOrder! : [];
  for (const b of order) {
    const rec = b as { key?: string; label?: string };
    if (String(rec.key || "").trim() === key) {
      return String(rec.label || rec.key || key).trim() || key;
    }
  }
  return key;
}

export type SimilarCardMatch = {
  cardId: string;
  title: string;
  bucketKey: string;
  bucketLabel: string;
  /** 0–1, maior = mais similar */
  score: number;
  levenshteinTitleRatio: number;
  bm25Norm: number;
  embeddingSimilarity?: number;
};

type CardRow = {
  id: string;
  title: string;
  bucket: string;
  tokens: string[];
  docLen: number;
  normTitle: string;
};

/**
 * BM25 leve (título + descrição) + Levenshtein no título + opcional similaridade por embeddings já armazenados.
 * Projetado para até ~500 cards por requisição (loop único em memória).
 */
export function findSimilarBoardCards(params: {
  board: BoardData;
  queryTitle: string;
  queryDescription?: string;
  limit?: number;
  excludeCardId?: string;
  embeddingByCardId?: Map<string, number[]>;
  queryEmbedding?: number[] | null;
}): SimilarCardMatch[] {
  const {
    board,
    queryTitle,
    queryDescription = "",
    limit = 3,
    excludeCardId,
    embeddingByCardId,
    queryEmbedding,
  } = params;

  if (shouldSuppressDuplicateSuggestion(queryTitle)) return [];

  const qt = normalizeForDuplicateTitle(queryTitle);
  if (qt.length < 3) return [];

  const queryText = `${queryTitle}\n${queryDescription}`.trim();
  const queryTokens = tokenizeForBm25(queryText);
  if (!queryTokens.length) return [];

  const cards = Array.isArray(board.cards) ? board.cards : [];
  const rows: CardRow[] = [];

  for (const raw of cards) {
    const c = raw as Record<string, unknown>;
    const id = String(c.id || "").trim();
    if (!id || id === excludeCardId) continue;
    const title = String(c.title || "");
    const desc = String(c.desc || "");
    const bucket = String(c.bucket || "");
    const body = `${title}\n${desc}`;
    const tokens = tokenizeForBm25(body);
    const docLen = Math.max(1, tokens.length);
    rows.push({
      id,
      title: title.slice(0, 500),
      bucket,
      tokens,
      docLen,
      normTitle: normalizeForDuplicateTitle(title),
    });
  }

  const N = rows.length;
  if (!N) return [];

  const k1 = 1.2;
  const b = 0.75;
  const avgdl = rows.reduce((s, r) => s + r.docLen, 0) / N;

  const df = new Map<string, number>();
  for (const r of rows) {
    const seen = new Set<string>();
    for (const t of r.tokens) {
      if (!seen.has(t)) {
        seen.add(t);
        df.set(t, (df.get(t) || 0) + 1);
      }
    }
  }

  const bm25Raw: number[] = new Array(N);
  for (let i = 0; i < N; i++) {
    const r = rows[i];
    const tf = new Map<string, number>();
    for (const t of r.tokens) {
      tf.set(t, (tf.get(t) || 0) + 1);
    }
    let s = 0;
    for (const q of queryTokens) {
      const nqi = df.get(q) || 0;
      const idf = Math.log((N - nqi + 0.5) / (nqi + 0.5) + 1);
      const f = tf.get(q) || 0;
      if (!f) continue;
      const denom = f + k1 * (1 - b + (b * r.docLen) / avgdl);
      s += idf * ((f * (k1 + 1)) / denom);
    }
    bm25Raw[i] = s;
  }

  let maxBm = 0;
  for (const x of bm25Raw) {
    if (x > maxBm) maxBm = x;
  }
  const bm25NormArr = bm25Raw.map((x) => (maxBm > 0 ? x / maxBm : 0));

  const hasEmb =
    Boolean(queryEmbedding?.length) &&
    Boolean(embeddingByCardId?.size) &&
    queryEmbedding!.length > 0;

  const scored: SimilarCardMatch[] = [];

  for (let i = 0; i < N; i++) {
    const r = rows[i];
    const levR = levenshteinRatio(qt, r.normTitle);
    /** Penaliza títulos muito diferentes; reforço quando distância normalizada < 0.3 */
    const levSim = levR < 0.3 ? 1 - levR / 0.3 : Math.max(0, 1 - levR);

    const bmN = bm25NormArr[i];

    let embSim = 0;
    if (hasEmb) {
      const emb = embeddingByCardId!.get(r.id);
      if (emb?.length && queryEmbedding!.length === emb.length) {
        embSim = Math.max(0, cosineSimilarity(queryEmbedding!, emb));
      }
    }

    let score: number;
    if (hasEmb) {
      score = 0.34 * levSim + 0.33 * bmN + 0.33 * embSim;
    } else {
      score = 0.48 * levSim + 0.52 * bmN;
    }

    /** Exige sinal lexical mínimo para não ranquear ruído */
    const strongTitle = levR < 0.28;
    const strongBm = bmN > 0.18;
    const strongEmb = embSim > 0.72;
    if (!strongTitle && !strongBm && !strongEmb) continue;
    if (score < 0.38 && !strongTitle) continue;

    scored.push({
      cardId: r.id,
      title: r.title,
      bucketKey: r.bucket,
      bucketLabel: bucketLabelForKey(board, r.bucket),
      score: Math.min(1, score),
      levenshteinTitleRatio: levR,
      bm25Norm: bmN,
      embeddingSimilarity: hasEmb ? embSim : undefined,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
