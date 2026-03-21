/**
 * Chunks de Flux Docs com embeddings para RAG (coleção `doc_chunks`).
 *
 * Índice Atlas Vector Search (criar no Atlas UI; nome padrão `doc_chunks_vector_idx` ou
 * `MONGODB_VECTOR_INDEX_DOC_CHUNKS`):
 * - path: `vectorContent` (array de floats, dimensão = saída do modelo em TOGETHER_DOCS_EMBEDDING_MODEL)
 * - similarity: cosine
 * - filtros: incluir campo `orgId` (string) para pré-filtragem
 */
import { createHash } from "crypto";
import type { Db } from "mongodb";
import { chunkDocMarkdown } from "@/lib/doc-chunk-split";
import { cosineSimilarity, fetchDocsChunkEmbeddings } from "@/lib/embeddings-together";
import type { DocData } from "@/lib/kv-docs";
import { getDb, isMongoConfigured } from "@/lib/mongo";

export const COL_DOC_CHUNKS = "doc_chunks";

/** Campo de vetor para MongoDB Atlas Vector Search (índice deve apontar para este path). */
export const DOC_CHUNK_VECTOR_FIELD = "vectorContent";

export type DocChunkStored = {
  _id: string;
  orgId: string;
  docId: string;
  docTitle: string;
  chunkId: string;
  text: string;
  contentHash: string;
  vectorContent: number[];
  updatedAt: string;
};

const EMBED_BATCH = 24;
let indexesEnsured = false;

function chunkDocId(orgId: string, chunkId: string): string {
  return `${orgId}:${chunkId}`;
}

export function hashDocChunkContent(docTitle: string, text: string): string {
  const t = `${String(docTitle || "").trim()}\n${String(text || "").trim()}`;
  return createHash("sha256").update(t, "utf8").digest("hex");
}

function embedInputForChunk(docTitle: string, text: string): string {
  return [`Título: ${String(docTitle || "").trim()}`, "", String(text || "").trim()].join("\n").slice(0, 8000);
}

async function ensureDocChunkIndexes(db: Db): Promise<void> {
  if (indexesEnsured) return;
  await db.collection(COL_DOC_CHUNKS).createIndex({ orgId: 1, chunkId: 1 }, { unique: true });
  await db.collection(COL_DOC_CHUNKS).createIndex({ orgId: 1, docId: 1 });
  await db.collection(COL_DOC_CHUNKS).createIndex({ orgId: 1, updatedAt: -1 });
  indexesEnsured = true;
}

function vectorIndexName(): string {
  return (process.env.MONGODB_VECTOR_INDEX_DOC_CHUNKS || "doc_chunks_vector_idx").trim();
}

/**
 * Sincroniza chunks e embeddings no MongoDB para um documento (create/update).
 * Sem TOGETHER_API_KEY não grava vetores (retrieval cai no keyword em docs-rag).
 */
export async function syncDocChunksFromDocument(
  orgId: string,
  doc: DocData,
  opts?: { forceReembed?: boolean }
): Promise<{ upserted: number; skippedNoApi: boolean }> {
  if (!isMongoConfigured()) return { upserted: 0, skippedNoApi: false };

  const chunks = chunkDocMarkdown(doc);
  const db = await getDb();
  await ensureDocChunkIndexes(db);
  const col = db.collection<DocChunkStored>(COL_DOC_CHUNKS);

  const newChunkIds = chunks.map((c) => c.chunkId);
  await col.deleteMany({
    orgId,
    docId: doc.id,
    ...(newChunkIds.length ? { chunkId: { $nin: newChunkIds } } : {}),
  });

  if (!chunks.length) return { upserted: 0, skippedNoApi: false };

  const apiKey = process.env.TOGETHER_API_KEY?.trim();
  if (!apiKey) {
    return { upserted: 0, skippedNoApi: true };
  }

  const existing = await col.find({ orgId, docId: doc.id }).toArray();
  const byChunkId = new Map(existing.map((e) => [e.chunkId, e]));

  const needEmbed = chunks.filter((c) => {
    if (opts?.forceReembed) return true;
    const h = hashDocChunkContent(c.docTitle, c.text);
    const prev = byChunkId.get(c.chunkId);
    return !(
      prev &&
      prev.contentHash === h &&
      Array.isArray(prev.vectorContent) &&
      prev.vectorContent.length > 0
    );
  });

  if (!needEmbed.length) return { upserted: 0, skippedNoApi: false };

  let upserted = 0;
  const now = new Date().toISOString();

  for (let i = 0; i < needEmbed.length; i += EMBED_BATCH) {
    const batch = needEmbed.slice(i, i + EMBED_BATCH);
    const inputs = batch.map((c) => embedInputForChunk(c.docTitle, c.text));
    const vectors = await fetchDocsChunkEmbeddings(inputs);
    if (!vectors || vectors.length !== batch.length) {
      return { upserted, skippedNoApi: true };
    }
    for (let j = 0; j < batch.length; j++) {
      const c = batch[j];
      const emb = vectors[j];
      if (!emb?.length) continue;
      const row: DocChunkStored = {
        _id: chunkDocId(orgId, c.chunkId),
        orgId,
        docId: c.docId,
        docTitle: c.docTitle,
        chunkId: c.chunkId,
        text: c.text,
        contentHash: hashDocChunkContent(c.docTitle, c.text),
        vectorContent: emb,
        updatedAt: now,
      };
      await col.replaceOne({ _id: row._id }, row, { upsert: true });
      upserted++;
    }
  }

  return { upserted, skippedNoApi: false };
}

export async function deleteDocChunksForDocument(orgId: string, docId: string): Promise<void> {
  if (!isMongoConfigured()) return;
  const db = await getDb();
  await ensureDocChunkIndexes(db);
  await db.collection(COL_DOC_CHUNKS).deleteMany({ orgId, docId });
}

export type VectorSearchHit = {
  chunk: Pick<DocChunkStored, "docId" | "docTitle" | "chunkId" | "text">;
  score: number;
};

/**
 * Busca semântica: $vectorSearch no Atlas quando disponível; senão cosine na aplicação.
 */
export async function searchDocChunksByEmbedding(
  orgId: string,
  queryVector: number[],
  limit: number,
  minScore: number
): Promise<VectorSearchHit[]> {
  if (!isMongoConfigured() || !queryVector.length) return [];

  const db = await getDb();
  await ensureDocChunkIndexes(db);
  const col = db.collection<DocChunkStored>(COL_DOC_CHUNKS);

  const safeLimit = Math.max(1, Math.min(limit, 50));
  const numCandidates = Math.min(500, Math.max(safeLimit * 8, 100));

  try {
    const pipeline = [
      {
        $vectorSearch: {
          index: vectorIndexName(),
          path: DOC_CHUNK_VECTOR_FIELD,
          queryVector,
          numCandidates,
          limit: safeLimit * 3,
          filter: { orgId },
        },
      },
      {
        $project: {
          docId: 1,
          docTitle: 1,
          chunkId: 1,
          text: 1,
          relevanceScore: { $meta: "vectorSearchScore" },
        },
      },
      { $match: { relevanceScore: { $gte: minScore } } },
      { $limit: safeLimit },
    ];

    const rows = await col.aggregate(pipeline as object[]).toArray();
    const out: VectorSearchHit[] = [];
    for (const r of rows) {
      const score = typeof (r as { relevanceScore?: number }).relevanceScore === "number" ? (r as { relevanceScore: number }).relevanceScore : 0;
      if (score < minScore) continue;
      out.push({
        chunk: {
          docId: String((r as DocChunkStored).docId),
          docTitle: String((r as DocChunkStored).docTitle),
          chunkId: String((r as DocChunkStored).chunkId),
          text: String((r as DocChunkStored).text),
        },
        score,
      });
    }
    if (out.length) return out.slice(0, safeLimit);
  } catch (e) {
    console.warn("[doc-chunks] $vectorSearch indisponível ou índice ausente — fallback in-process.", e instanceof Error ? e.message : e);
  }

  const cursor = col.find(
    { orgId, vectorContent: { $exists: true, $not: { $size: 0 } } },
    { projection: { docId: 1, docTitle: 1, chunkId: 1, text: 1, vectorContent: 1 } }
  );
  const all = await cursor.toArray();
  const scored: VectorSearchHit[] = [];
  for (const row of all) {
    const sim = cosineSimilarity(queryVector, row.vectorContent);
    if (sim >= minScore) {
      scored.push({
        chunk: {
          docId: row.docId,
          docTitle: row.docTitle,
          chunkId: row.chunkId,
          text: row.text,
        },
        score: sim,
      });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, safeLimit);
}

export async function reindexAllDocsForOrg(
  orgId: string,
  docs: DocData[],
  opts?: { forceReembed?: boolean }
): Promise<{ docsProcessed: number; chunksUpserted: number; skippedNoApi: boolean }> {
  let chunksUpserted = 0;
  let skippedNoApi = false;
  const force = Boolean(opts?.forceReembed);
  for (const doc of docs) {
    const r = await syncDocChunksFromDocument(orgId, doc, { forceReembed: force });
    chunksUpserted += r.upserted;
    if (r.skippedNoApi) skippedNoApi = true;
  }
  return { docsProcessed: docs.length, chunksUpserted, skippedNoApi };
}
