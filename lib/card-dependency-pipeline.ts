import type { BoardData } from "@/lib/kv-boards";
import {
  hashCardEmbedText,
  listEmbeddingsForOrgBoards,
  replaceOrgDependencySuggestions,
  upsertCardEmbedding,
  type CardDependencySuggestion,
} from "@/lib/kv-card-dependencies";
import { cosineSimilarity, fetchTextEmbeddings } from "@/lib/embeddings-together";

const SUGGEST_THRESHOLD = 0.85;
const EMBED_BATCH = 24;
const MAX_SUGGESTIONS = 500;

function isCardActive(c: { progress?: string }): boolean {
  return String(c.progress || "") !== "Concluída";
}

function cardText(c: { title?: string; desc?: string }): string {
  return `${String(c.title || "").trim()}\n${String(c.desc || "").trim()}`.slice(0, 8000);
}

/**
 * Atualiza embeddings para cards ativos (não concluídos) quando o texto mudou.
 */
export async function syncEmbeddingsForOrg(orgId: string, boards: BoardData[]): Promise<{ updated: number; skippedNoApi: boolean }> {
  const payloads: Array<{
    orgId: string;
    boardId: string;
    cardId: string;
    title: string;
    desc: string;
    text: string;
  }> = [];

  for (const b of boards) {
    const cards = Array.isArray(b.cards) ? b.cards : [];
    for (const raw of cards) {
      const c = raw as { id?: string; title?: string; desc?: string; progress?: string };
      if (!c.id || !isCardActive(c)) continue;
      const text = cardText(c);
      if (!text.trim()) continue;
      payloads.push({
        orgId,
        boardId: b.id,
        cardId: c.id,
        title: String(c.title || ""),
        desc: String(c.desc || ""),
        text,
      });
    }
  }

  if (!payloads.length) return { updated: 0, skippedNoApi: false };

  const existing = await listEmbeddingsForOrgBoards(
    orgId,
    [...new Set(payloads.map((p) => p.boardId))]
  );
  const byKey = new Map(existing.map((e) => [`${e.boardId}:${e.cardId}`, e]));

  const needEmbed = payloads.filter((p) => {
    const h = hashCardEmbedText(p.title, p.desc);
    const prev = byKey.get(`${p.boardId}:${p.cardId}`);
    return !prev || prev.textHash !== h;
  });

  if (!needEmbed.length) return { updated: 0, skippedNoApi: false };

  let updated = 0;
  let skippedNoApi = false;

  for (let i = 0; i < needEmbed.length; i += EMBED_BATCH) {
    const chunk = needEmbed.slice(i, i + EMBED_BATCH);
    const vectors = await fetchTextEmbeddings(chunk.map((c) => c.text));
    if (!vectors) {
      skippedNoApi = true;
      break;
    }
    const now = new Date().toISOString();
    for (let j = 0; j < chunk.length; j++) {
      const p = chunk[j];
      const emb = vectors[j];
      if (!emb?.length) continue;
      await upsertCardEmbedding({
        orgId: p.orgId,
        boardId: p.boardId,
        cardId: p.cardId,
        textHash: hashCardEmbedText(p.title, p.desc),
        embedding: emb,
        updatedAt: now,
      });
      updated++;
    }
  }

  return { updated, skippedNoApi };
}

function canonicalPair(
  a: { boardId: string; cardId: string },
  b: { boardId: string; cardId: string }
): { boardIdA: string; cardIdA: string; boardIdB: string; cardIdB: string } {
  const sa = `${a.boardId}\0${a.cardId}`;
  const sb = `${b.boardId}\0${b.cardId}`;
  if (sa <= sb) {
    return { boardIdA: a.boardId, cardIdA: a.cardId, boardIdB: b.boardId, cardIdB: b.cardId };
  }
  return { boardIdA: b.boardId, cardIdA: b.cardId, boardIdB: a.boardId, cardIdB: a.cardId };
}

/**
 * Pares cross-board com similaridade > threshold (apenas embeddings existentes).
 */
export async function computeCrossBoardSuggestions(orgId: string, boards: BoardData[]): Promise<number> {
  const boardIds = boards.map((b) => b.id).filter(Boolean);
  const embs = await listEmbeddingsForOrgBoards(orgId, boardIds);
  const byBoard = new Map<string, typeof embs>();
  for (const e of embs) {
    const list = byBoard.get(e.boardId) ?? [];
    list.push(e);
    byBoard.set(e.boardId, list);
  }

  const suggestions: Omit<CardDependencySuggestion, "_id">[] = [];
  const boardIdList = [...byBoard.keys()].sort();

  for (let i = 0; i < boardIdList.length; i++) {
    for (let j = i + 1; j < boardIdList.length; j++) {
      const ba = boardIdList[i];
      const bb = boardIdList[j];
      const la = byBoard.get(ba) ?? [];
      const lb = byBoard.get(bb) ?? [];
      for (const ea of la) {
        for (const eb of lb) {
          const sim = cosineSimilarity(ea.embedding, eb.embedding);
          if (sim >= SUGGEST_THRESHOLD) {
            const c = canonicalPair(
              { boardId: ea.boardId, cardId: ea.cardId },
              { boardId: eb.boardId, cardId: eb.cardId }
            );
            suggestions.push({
              orgId,
              ...c,
              score: Math.round(sim * 10000) / 10000,
              updatedAt: new Date().toISOString(),
            });
          }
        }
      }
    }
  }

  suggestions.sort((a, b) => b.score - a.score);
  await replaceOrgDependencySuggestions(orgId, suggestions.slice(0, MAX_SUGGESTIONS));
  return suggestions.length;
}
