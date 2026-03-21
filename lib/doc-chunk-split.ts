import type { DocData } from "./kv-docs";

export type DocChunk = {
  docId: string;
  docTitle: string;
  chunkId: string;
  text: string;
};

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
