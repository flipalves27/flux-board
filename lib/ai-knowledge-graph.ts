/**
 * AI Knowledge Graph: builds a semantic similarity graph of board cards using embeddings.
 * Cards become nodes; edges represent semantic similarity above a threshold.
 */
import type { BoardData } from "@/lib/kv-boards";
import { fetchTextEmbeddings } from "@/lib/embeddings-together";

export type KnowledgeGraphNode = {
  id: string;
  title: string;
  column: string;
  tags: string[];
  priority: string;
};

export type KnowledgeGraphEdge = {
  source: string;
  target: string;
  similarity: number;
  type: "related" | "duplicate_risk" | "dependency";
};

export type KnowledgeGraphOutput = {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  clusterCount: number;
  generatedAt: string;
};

const SIMILARITY_THRESHOLD = 0.78;
const DUPLICATE_THRESHOLD = 0.93;
const MAX_CARDS = 80;

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export async function buildKnowledgeGraph(params: { board: BoardData }): Promise<KnowledgeGraphOutput> {
  const { board } = params;
  const cards = Array.isArray(board.cards) ? (board.cards as Array<Record<string, unknown>>) : [];
  const activeCards = cards
    .filter((c) => !["Concluída", "Done", "Closed", "Cancelada"].includes(String(c.progress ?? "")))
    .slice(0, MAX_CARDS);

  if (activeCards.length < 2) {
    return {
      nodes: activeCards.map((c) => ({
        id: String(c.id ?? ""),
        title: String(c.title ?? "").slice(0, 100),
        column: String(c.progress ?? ""),
        tags: Array.isArray(c.tags) ? (c.tags as string[]) : [],
        priority: String(c.priority ?? ""),
      })),
      edges: [],
      clusterCount: activeCards.length,
      generatedAt: new Date().toISOString(),
    };
  }

  const nodes: KnowledgeGraphNode[] = activeCards.map((c) => ({
    id: String(c.id ?? ""),
    title: String(c.title ?? "").slice(0, 100),
    column: String(c.progress ?? ""),
    tags: Array.isArray(c.tags) ? (c.tags as string[]) : [],
    priority: String(c.priority ?? ""),
  }));

  const texts = nodes.map((n) => `${n.title} ${n.tags.join(" ")} ${n.column}`);
  const embeddings = await fetchTextEmbeddings(texts);

  if (!embeddings || embeddings.length !== nodes.length) {
    return { nodes, edges: [], clusterCount: nodes.length, generatedAt: new Date().toISOString() };
  }

  const edges: KnowledgeGraphEdge[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const sim = cosineSimilarity(embeddings[i], embeddings[j]);
      if (sim >= SIMILARITY_THRESHOLD) {
        edges.push({
          source: nodes[i].id,
          target: nodes[j].id,
          similarity: Math.round(sim * 100) / 100,
          type: sim >= DUPLICATE_THRESHOLD ? "duplicate_risk" : "related",
        });
      }
    }
  }

  // Simple connected-components cluster count
  const parent = new Map<string, string>(nodes.map((n) => [n.id, n.id]));
  function find(x: string): string {
    const p = parent.get(x)!;
    if (p !== x) { const r = find(p); parent.set(x, r); return r; }
    return x;
  }
  for (const e of edges) {
    const rx = find(e.source), ry = find(e.target);
    if (rx !== ry) parent.set(rx, ry);
  }
  const clusterCount = new Set(nodes.map((n) => find(n.id))).size;

  edges.sort((a, b) => b.similarity - a.similarity);

  return { nodes, edges: edges.slice(0, 200), clusterCount, generatedAt: new Date().toISOString() };
}
