import { cosineSimilarity, DEFAULT_DOCS_EMBEDDING_MODEL, fetchDocsChunkEmbeddings } from "@/lib/embeddings-together";
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

export async function embedSpecPlanChunks(
  fileName: string,
  chunks: SpecPlanChunk[]
): Promise<SpecPlanChunkWithVector[] | null> {
  if (!chunks.length) return [];
  const inputs = chunks.map((c) => embedInputForSpecChunk(fileName, c.text));
  const out: SpecPlanChunkWithVector[] = [];
  const batchSize = SPEC_PLAN_EMBED_BATCH;

  for (let i = 0; i < inputs.length; i += batchSize) {
    const batchIn = inputs.slice(i, i + batchSize);
    const vecs = await fetchDocsChunkEmbeddings(batchIn);
    if (!vecs || vecs.length !== batchIn.length) return null;
    for (let j = 0; j < batchIn.length; j++) {
      const ch = chunks[i + j];
      out.push({
        chunkId: ch.chunkId,
        text: ch.text,
        vector: vecs[j],
        chunkIndex: ch.chunkIndex,
      });
    }
  }
  return out;
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

export type SpecPlanRetrievalFail = { ok: false };

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

  const withVec = await embedSpecPlanChunks(input.fileName, input.chunks);
  if (withVec === null) return { ok: false };
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
    const vecs = await fetchDocsChunkEmbeddings(batch);
    if (!vecs || vecs.length !== batch.length) return { ok: false };
    qEmbeds.push(...vecs);
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
