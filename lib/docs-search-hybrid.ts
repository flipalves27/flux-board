import { fetchDocsChunkEmbeddings } from "./embeddings-together";
import { searchDocChunksByEmbedding, type VectorSearchHit } from "./kv-doc-chunks";
import type { DocData } from "./docs-types";
import { isMongoConfigured } from "./mongo";
import { type DocSearchContext, listDocsFlat, orderSearchByContext, searchDocs } from "./kv-docs";

const RRF_K = 60;
/** Slightly looser than strict RAG (0.7) to feed RRF; still filters noise. */
const HYBRID_VECTOR_FLOOR = 0.5;

export type SearchEvidence = {
  docId: string;
  chunkId: string;
  excerpt: string;
  score: number;
};

/**
 * Reciprocal rank fusion (RRF) between full-text and vector hit lists, then contextual boost.
 * Evidence: best matching chunk per doc in the result set (for UI citations).
 */
export async function searchDocsHybrid(
  orgId: string,
  query: string,
  limit: number,
  ctx?: DocSearchContext
): Promise<{ docs: DocData[]; usedVector: boolean; evidence: SearchEvidence[] }> {
  const q = String(query || "").trim();
  if (!q) return { docs: [], usedVector: false, evidence: [] };

  const textCap = Math.max(60, limit * 3);
  const textDocs = await searchDocs(orgId, q, textCap, ctx);
  const byId = new Map((await listDocsFlat(orgId)).map((d) => [d.id, d]));

  if (!isMongoConfigured() || !process.env.TOGETHER_API_KEY?.trim()) {
    return { docs: textDocs.slice(0, limit), usedVector: false, evidence: [] };
  }

  const vecs = await fetchDocsChunkEmbeddings([q]);
  const qv = vecs?.[0];
  if (!qv?.length) {
    return { docs: textDocs.slice(0, limit), usedVector: false, evidence: [] };
  }

  const hits: VectorSearchHit[] = await searchDocChunksByEmbedding(orgId, qv, 80, HYBRID_VECTOR_FLOOR);
  if (!hits.length) {
    return { docs: textDocs.slice(0, limit), usedVector: false, evidence: [] };
  }

  const bestByDoc = new Map<string, VectorSearchHit>();
  for (const h of hits) {
    const prev = bestByDoc.get(h.chunk.docId);
    if (!prev || h.score > prev.score) bestByDoc.set(h.chunk.docId, h);
  }

  const sortedDocIds = [...bestByDoc.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .map(([, hit]) => hit.chunk.docId);

  const vecRank = new Map<string, number>();
  sortedDocIds.forEach((d, i) => {
    if (byId.get(d)) vecRank.set(d, i + 1);
  });
  if (!vecRank.size) {
    return { docs: textDocs.slice(0, limit), usedVector: false, evidence: [] };
  }

  const textRank = new Map<string, number>();
  textDocs.forEach((d, i) => textRank.set(d.id, i + 1));

  const allIds = new Set<string>([...textRank.keys(), ...vecRank.keys()]);
  const rrf = [...allIds]
    .map((id) => {
      const rt = textRank.get(id);
      const rv = vecRank.get(id);
      let s = 0;
      if (rt) s += 1 / (RRF_K + rt);
      if (rv) s += 1 / (RRF_K + rv);
      return { id, s, d: byId.get(id) };
    })
    .filter((x): x is { id: string; s: number; d: DocData } => Boolean(x.d))
    .sort((a, b) => b.s - a.s);

  const mergedDocs = rrf.map((x) => x.d);
  const rrfPos = new Map(mergedDocs.map((d, i) => [d.id, i] as const));

  const ranked = orderSearchByContext(mergedDocs, Math.max(limit * 2, 50), ctx, (d) => rrfPos.get(d.id) ?? 9999);
  const finalDocs = ranked.slice(0, limit);

  const evidence = buildEvidence(finalDocs, bestByDoc);
  return { docs: finalDocs, usedVector: true, evidence };
}

function buildEvidence(docs: DocData[], bestByDoc: Map<string, VectorSearchHit>): SearchEvidence[] {
  const out: SearchEvidence[] = [];
  for (const d of docs) {
    const hit = bestByDoc.get(d.id);
    if (!hit) continue;
    out.push({
      docId: d.id,
      chunkId: hit.chunk.chunkId,
      excerpt: String(hit.chunk.text || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 280),
      score: hit.score,
    });
  }
  return out;
}
