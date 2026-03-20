import type { DocData } from "./kv-docs";
import { listDocsFlat } from "./kv-docs";

export type DocChunk = {
  docId: string;
  docTitle: string;
  chunkId: string;
  text: string;
};

function normalize(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function chunkDocMarkdown(doc: DocData, chunkSize = 700): DocChunk[] {
  const text = String(doc.contentMd || "").trim();
  if (!text) return [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const chunks: DocChunk[] = [];
  let current = "";
  let i = 0;
  for (const line of lines) {
    if ((current + "\n" + line).length > chunkSize && current) {
      chunks.push({ docId: doc.id, docTitle: doc.title, chunkId: `${doc.id}:${i++}`, text: current });
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }
  if (current) chunks.push({ docId: doc.id, docTitle: doc.title, chunkId: `${doc.id}:${i++}`, text: current });
  return chunks;
}

export async function retrieveRelevantDocChunks(orgId: string, query: string, limit = 6): Promise<DocChunk[]> {
  const docs = await listDocsFlat(orgId);
  const chunks = docs.flatMap((d) => chunkDocMarkdown(d));
  const terms = normalize(query).split(" ").filter(Boolean);
  if (terms.length === 0) return [];
  const scored = chunks
    .map((chunk) => {
      const hay = normalize(`${chunk.docTitle}\n${chunk.text}`);
      let score = 0;
      for (const t of terms) if (hay.includes(t)) score += 1;
      if (normalize(chunk.docTitle).includes(normalize(query))) score += 2;
      return { chunk, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(limit, 20)));
  return scored.map((s) => s.chunk);
}
