import type { DocChunk } from "./doc-chunk-split";
import { chunkDocMarkdown } from "./doc-chunk-split";
import { fetchDocsChunkEmbeddings } from "./embeddings-together";
import { listDocsFlat } from "./kv-docs";
import { isMongoConfigured } from "./mongo";
import { searchDocChunksByEmbedding } from "./kv-doc-chunks";

export type { DocChunk } from "./doc-chunk-split";
export { chunkDocMarkdown } from "./doc-chunk-split";

/** Chunk enriquecido para RAG / debug do Copilot. */
export type DocChunkRag = DocChunk & {
  relevanceScore?: number;
  retrievalMethod?: "vector" | "keyword";
};

export type RagRetrievalDebug = {
  method: "vector" | "keyword";
  durationMs: number;
  chunks: Array<{
    chunkId: string;
    docId: string;
    docTitle: string;
    score: number;
    method: "vector" | "keyword";
  }>;
};

const VECTOR_MIN_SCORE = 0.7;

function normalize(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function keywordRetrieve(orgId: string, query: string, limit: number): Promise<DocChunkRag[]> {
  const docs = await listDocsFlat(orgId);
  const chunks = docs.flatMap((d) => chunkDocMarkdown(d));
  const terms = normalize(query).split(" ").filter(Boolean);
  if (terms.length === 0) return [];
  const nTerms = terms.length;
  const scored = chunks
    .map((chunk) => {
      const hay = normalize(`${chunk.docTitle}\n${chunk.text}`);
      let hits = 0;
      for (const t of terms) if (hay.includes(t)) hits += 1;
      let score = hits / nTerms;
      if (normalize(chunk.docTitle).includes(normalize(query))) score = Math.min(1, score + 0.35);
      return { chunk, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(limit, 20)));
  return scored.map((s) => ({
    ...s.chunk,
    relevanceScore: Math.round(s.score * 1000) / 1000,
    retrievalMethod: "keyword" as const,
  }));
}

async function vectorRetrieve(orgId: string, query: string, limit: number): Promise<DocChunkRag[] | null> {
  if (!isMongoConfigured()) return null;
  const apiKey = process.env.TOGETHER_API_KEY?.trim();
  if (!apiKey) return null;

  const q = String(query || "").trim();
  if (!q) return null;

  const emb = await fetchDocsChunkEmbeddings([q]);
  const queryVector = emb?.[0];
  if (!queryVector?.length) return null;

  const hits = await searchDocChunksByEmbedding(orgId, queryVector, limit, VECTOR_MIN_SCORE);
  if (!hits.length) return null;

  return hits.map((h) => ({
    docId: h.chunk.docId,
    docTitle: h.chunk.docTitle,
    chunkId: h.chunk.chunkId,
    text: h.chunk.text,
    relevanceScore: Math.round(h.score * 1000) / 1000,
    retrievalMethod: "vector" as const,
  }));
}

/**
 * RAG: busca semântica (embeddings + MongoDB Vector Search ou cosine in-process) com fallback em keyword.
 */
export async function retrieveRelevantDocChunks(orgId: string, query: string, limit = 6): Promise<DocChunkRag[]> {
  const { chunks } = await retrieveRelevantDocChunksWithDebug(orgId, query, limit);
  return chunks;
}

export async function retrieveRelevantDocChunksWithDebug(
  orgId: string,
  query: string,
  limit = 6
): Promise<{ chunks: DocChunkRag[]; debug: RagRetrievalDebug }> {
  const t0 = Date.now();
  const safeLimit = Math.max(1, Math.min(limit, 20));

  let method: "vector" | "keyword" = "keyword";
  let chunks: DocChunkRag[] = [];

  const vectorChunks = await vectorRetrieve(orgId, query, safeLimit);
  if (vectorChunks?.length) {
    method = "vector";
    chunks = vectorChunks;
  } else {
    chunks = await keywordRetrieve(orgId, query, safeLimit);
  }

  const durationMs = Date.now() - t0;
  const debug: RagRetrievalDebug = {
    method,
    durationMs,
    chunks: chunks.map((c) => ({
      chunkId: c.chunkId,
      docId: c.docId,
      docTitle: c.docTitle,
      score: c.relevanceScore ?? 0,
      method: c.retrievalMethod ?? method,
    })),
  };

  return { chunks, debug };
}
