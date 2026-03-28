import {
  cosineSimilarity,
  DEFAULT_DOCS_EMBEDDING_MODEL,
  DEFAULT_GENERAL_EMBEDDING_MODEL,
  fetchTextEmbeddingsWithMeta,
  type TextEmbeddingsResult,
} from "@/lib/embeddings-together";
import type { SpecPlanChunk } from "@/lib/spec-plan-chunk";
import {
  SPEC_PLAN_EMBED_BATCH,
  SPEC_PLAN_RETRIEVAL_CONTEXT_MAX_CHARS,
  SPEC_PLAN_RETRIEVAL_TOP_K,
} from "@/lib/spec-plan-constants";
import type { SpecPlanMethodology } from "@/lib/spec-plan-schemas";

const EMBED_INPUT_MAX_CHARS = 8000;

const CONTEXT_PREFIX_PT =
  "Os trechos abaixo foram selecionados por relevância semântica a partir do documento completo da especificação. Use-os como fonte principal; podem existir lacunas.\n\n";

export function embedInputForSpecChunk(fileName: string, text: string): string {
  return [`Especificação: ${String(fileName || "").trim()}`, "", String(text || "").trim()]
    .join("\n")
    .slice(0, EMBED_INPUT_MAX_CHARS);
}

export function specPlanRetrievalQueries(methodology: SpecPlanMethodology): string[] {
  const q1 =
    "requisitos funcionais e não funcionais escopo entregáveis premissas restrições riscos";
  const q2 = "arquitetura integração dados APIs segurança desempenho qualidade";
  if (methodology === "lss") {
    return [
      q1,
      q2,
      "métricas processo atual melhorias DMAIC causa raiz controle indicadores",
    ];
  }
  return [q1, q2];
}

export type SpecPlanChunkWithVector = {
  chunkId: string;
  text: string;
  vector: number[];
  chunkIndex: number;
};

export type SpecPlanRetrievalHit = {
  chunkId: string;
  text: string;
  score: number;
  chunkIndex: number;
};

function summarizeEmbedFailure(r: Extract<TextEmbeddingsResult, { ok: false }>): string {
  const base = r.error;
  if (r.bodySnippet?.trim()) return `${base}: ${r.bodySnippet.trim().slice(0, 220)}`;
  if (r.status != null) return `${base} (status ${r.status})`;
  return base;
}

/**
 * Spec-plan só usa vetores em memória (não grava no índice RAG do Mongo).
 * Se `TOGETHER_DOCS_EMBEDDING_MODEL` falhar (modelo indisponível, quota, etc.), tenta o modelo geral.
 */
async function fetchSpecPlanEmbeddingBatch(
  inputs: string[]
): Promise<{ ok: true; vectors: number[][] } | { ok: false; reason: string }> {
  const docsModel = (process.env.TOGETHER_DOCS_EMBEDDING_MODEL || DEFAULT_DOCS_EMBEDDING_MODEL).trim();
  const r1 = await fetchTextEmbeddingsWithMeta(inputs, { model: docsModel });
  if (r1.ok) return { ok: true, vectors: r1.vectors };

  const detail1 = summarizeEmbedFailure(r1);
  const generalModel = (process.env.TOGETHER_EMBEDDING_MODEL || DEFAULT_GENERAL_EMBEDDING_MODEL).trim();
  console.warn(
    "[spec-plan-retrieval] modelo de documentos falhou; a repetir embeddings com modelo geral.",
    { docsModel, generalModel, detail: detail1 }
  );

  const r2 = await fetchTextEmbeddingsWithMeta(inputs, { model: generalModel });
  if (r2.ok) return { ok: true, vectors: r2.vectors };

  return {
    ok: false,
    reason: `${detail1} | fallback ${generalModel}: ${summarizeEmbedFailure(r2)}`,
  };
}

async function embedSpecPlanChunksWithMeta(
  fileName: string,
  chunks: SpecPlanChunk[]
): Promise<
  | { ok: true; withVec: SpecPlanChunkWithVector[] }
  | { ok: false; reason: string }
> {
  if (!chunks.length) return { ok: true, withVec: [] };
  const inputs = chunks.map((c) => embedInputForSpecChunk(fileName, c.text));
  const out: SpecPlanChunkWithVector[] = [];
  const batchSize = SPEC_PLAN_EMBED_BATCH;

  for (let i = 0; i < inputs.length; i += batchSize) {
    const batchIn = inputs.slice(i, i + batchSize);
    const batchRes = await fetchSpecPlanEmbeddingBatch(batchIn);
    if (!batchRes.ok) return { ok: false, reason: batchRes.reason };
    for (let j = 0; j < batchIn.length; j++) {
      const ch = chunks[i + j];
      out.push({
        chunkId: ch.chunkId,
        text: ch.text,
        vector: batchRes.vectors[j],
        chunkIndex: ch.chunkIndex,
      });
    }
  }
  return { ok: true, withVec: out };
}

export function mergeHitsByChunkId(hits: SpecPlanRetrievalHit[]): SpecPlanRetrievalHit[] {
  const map = new Map<string, SpecPlanRetrievalHit>();
  for (const h of hits) {
    const prev = map.get(h.chunkId);
    if (!prev || h.score > prev.score) map.set(h.chunkId, h);
  }
  return Array.from(map.values()).sort((a, b) => b.score - a.score);
}

export function buildRetrievalContextFromHits(
  hits: SpecPlanRetrievalHit[],
  maxChars: number
): { text: string; chunksUsed: number } {
  const prefix = CONTEXT_PREFIX_PT;
  let budget = maxChars - prefix.length;
  if (budget < 400) {
    return { text: prefix, chunksUsed: 0 };
  }

  const parts: string[] = [];
  let used = 0;

  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    const block = `### Trecho ${used + 1}\n${h.text}\n\n`;
    if (block.length <= budget) {
      parts.push(block);
      budget -= block.length;
      used++;
      continue;
    }
    if (budget > 120) {
      const slice = h.text.slice(0, Math.max(0, budget - 40));
      if (slice.length >= 40) {
        parts.push(`### Trecho ${used + 1} (parcial)\n${slice}…\n\n`);
        used++;
      }
    }
    break;
  }

  return { text: prefix + parts.join(""), chunksUsed: used };
}

export type SpecPlanRetrievalOk = {
  ok: true;
  context: string;
  embeddedCount: number;
  queries: string[];
  preview: { chunkIndex: number; score: number }[];
  modelHint: string;
  chunksUsed: number;
};

export type SpecPlanRetrievalFail = { ok: false; reason: string };

export async function buildSpecPlanRetrievalContext(input: {
  fileName: string;
  methodology: SpecPlanMethodology;
  chunks: SpecPlanChunk[];
  topKPerQuery?: number;
  maxContextChars?: number;
}): Promise<SpecPlanRetrievalOk | SpecPlanRetrievalFail> {
  const topK = input.topKPerQuery ?? SPEC_PLAN_RETRIEVAL_TOP_K;
  const maxContextChars = input.maxContextChars ?? SPEC_PLAN_RETRIEVAL_CONTEXT_MAX_CHARS;
  const queries = specPlanRetrievalQueries(input.methodology);

  const embedded = await embedSpecPlanChunksWithMeta(input.fileName, input.chunks);
  if (!embedded.ok) return { ok: false, reason: embedded.reason };
  const withVec = embedded.withVec;
  if (!withVec.length) {
    const { text, chunksUsed } = buildRetrievalContextFromHits([], maxContextChars);
    return {
      ok: true,
      context: text,
      embeddedCount: 0,
      queries,
      preview: [],
      modelHint: (process.env.TOGETHER_DOCS_EMBEDDING_MODEL || DEFAULT_DOCS_EMBEDDING_MODEL).trim(),
      chunksUsed,
    };
  }

  const qTexts = queries.map((q) => String(q).slice(0, EMBED_INPUT_MAX_CHARS));
  const qEmbeds: number[][] = [];
  const batchSize = SPEC_PLAN_EMBED_BATCH;
  for (let i = 0; i < qTexts.length; i += batchSize) {
    const batch = qTexts.slice(i, i + batchSize);
    const batchRes = await fetchSpecPlanEmbeddingBatch(batch);
    if (!batchRes.ok) return { ok: false, reason: batchRes.reason };
    qEmbeds.push(...batchRes.vectors);
  }

  const allHits: SpecPlanRetrievalHit[] = [];
  for (let qi = 0; qi < queries.length; qi++) {
    const qv = qEmbeds[qi];
    const scored = withVec.map((c) => ({
      chunkId: c.chunkId,
      text: c.text,
      chunkIndex: c.chunkIndex,
      score: cosineSimilarity(qv, c.vector),
    }));
    scored.sort((a, b) => b.score - a.score);
    for (const h of scored.slice(0, topK)) {
      allHits.push(h);
    }
  }

  const merged = mergeHitsByChunkId(allHits);
  const { text, chunksUsed } = buildRetrievalContextFromHits(merged, maxContextChars);
  const modelHint = (process.env.TOGETHER_DOCS_EMBEDDING_MODEL || DEFAULT_DOCS_EMBEDDING_MODEL).trim();
  const preview = merged.slice(0, 15).map((h) => ({
    chunkIndex: h.chunkIndex,
    score: Math.round(h.score * 1000) / 1000,
  }));

  return {
    ok: true,
    context: text,
    embeddedCount: withVec.length,
    queries,
    preview,
    modelHint,
    chunksUsed,
  };
}
