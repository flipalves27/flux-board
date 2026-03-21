import { createHash } from "crypto";
import { getDb, isMongoConfigured } from "./mongo";
import type { Db, Document } from "mongodb";

export const COL_CARD_CROSS_LINKS = "card_cross_dependency_links";
export const COL_CARD_DEP_SUGGESTIONS = "card_dependency_suggestions";
export const COL_CARD_TEXT_EMBEDDINGS = "card_text_embeddings";

export type CardDependencyEdgeKind = "depends_on" | "blocks" | "related_to";

export type CardCrossDependencyLink = {
  _id: string;
  orgId: string;
  sourceBoardId: string;
  sourceCardId: string;
  targetBoardId: string;
  targetCardId: string;
  kind: CardDependencyEdgeKind;
  /** 1 = manual; sugestões aceitas podem copiar o score da IA */
  confidence: number;
  createdAt: string;
  createdByUserId?: string;
};

export type CardDependencySuggestion = {
  _id: string;
  orgId: string;
  boardIdA: string;
  cardIdA: string;
  boardIdB: string;
  cardIdB: string;
  score: number;
  updatedAt: string;
};

export type CardTextEmbeddingDoc = {
  _id: string;
  orgId: string;
  boardId: string;
  cardId: string;
  textHash: string;
  embedding: number[];
  updatedAt: string;
};

const memLinks: CardCrossDependencyLink[] = [];
const memSugg: CardDependencySuggestion[] = [];
const memEmb = new Map<string, CardTextEmbeddingDoc>();

function memEmbKey(orgId: string, boardId: string, cardId: string) {
  return `${orgId}:${boardId}:${cardId}`;
}

let indexesEnsured = false;

async function ensureIndexes(db: Db): Promise<void> {
  if (indexesEnsured) return;
  await db.collection(COL_CARD_CROSS_LINKS).createIndex({ orgId: 1, sourceBoardId: 1, sourceCardId: 1 });
  await db.collection(COL_CARD_CROSS_LINKS).createIndex({ orgId: 1, targetBoardId: 1, targetCardId: 1 });
  await db.collection(COL_CARD_CROSS_LINKS).createIndex(
    { orgId: 1, sourceBoardId: 1, sourceCardId: 1, targetBoardId: 1, targetCardId: 1, kind: 1 },
    { unique: true }
  );
  await db.collection(COL_CARD_DEP_SUGGESTIONS).createIndex({ orgId: 1, updatedAt: -1 });
  await db.collection(COL_CARD_DEP_SUGGESTIONS).createIndex(
    { orgId: 1, boardIdA: 1, cardIdA: 1, boardIdB: 1, cardIdB: 1 },
    { unique: true }
  );
  await db.collection(COL_CARD_TEXT_EMBEDDINGS).createIndex({ orgId: 1, boardId: 1, cardId: 1 }, { unique: true });
  await db.collection(COL_CARD_TEXT_EMBEDDINGS).createIndex({ orgId: 1, updatedAt: 1 });
  indexesEnsured = true;
}

export function hashCardEmbedText(title: string, desc: string): string {
  const t = `${String(title || "").trim()}\n${String(desc || "").trim()}`;
  return createHash("sha256").update(t, "utf8").digest("hex");
}

export async function createCrossDependencyLink(params: {
  orgId: string;
  sourceBoardId: string;
  sourceCardId: string;
  targetBoardId: string;
  targetCardId: string;
  kind: CardDependencyEdgeKind;
  confidence?: number;
  createdByUserId?: string;
}): Promise<CardCrossDependencyLink | null> {
  if (params.sourceBoardId === params.targetBoardId && params.sourceCardId === params.targetCardId) {
    return null;
  }
  const now = new Date().toISOString();
  const _id = `cdl_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const doc: CardCrossDependencyLink = {
    _id,
    orgId: params.orgId,
    sourceBoardId: params.sourceBoardId,
    sourceCardId: params.sourceCardId,
    targetBoardId: params.targetBoardId,
    targetCardId: params.targetCardId,
    kind: params.kind,
    confidence: typeof params.confidence === "number" ? params.confidence : 1,
    createdAt: now,
    createdByUserId: params.createdByUserId,
  };

  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    try {
      await db.collection<CardCrossDependencyLink>(COL_CARD_CROSS_LINKS).insertOne(doc);
      return doc;
    } catch {
      return null;
    }
  }
  if (memLinks.some((l) => l.orgId === doc.orgId && sameEdge(l, doc))) return null;
  memLinks.push(doc);
  return doc;
}

function sameEdge(a: CardCrossDependencyLink, b: CardCrossDependencyLink): boolean {
  return (
    a.sourceBoardId === b.sourceBoardId &&
    a.sourceCardId === b.sourceCardId &&
    a.targetBoardId === b.targetBoardId &&
    a.targetCardId === b.targetCardId &&
    a.kind === b.kind
  );
}

export async function deleteCrossDependencyLink(orgId: string, linkId: string): Promise<boolean> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    const r = await db.collection<CardCrossDependencyLink>(COL_CARD_CROSS_LINKS).deleteOne({
      _id: linkId,
      orgId,
    });
    return r.deletedCount === 1;
  }
  const i = memLinks.findIndex((l) => l._id === linkId && l.orgId === orgId);
  if (i < 0) return false;
  memLinks.splice(i, 1);
  return true;
}

export async function listCrossDependencyLinksForOrg(
  orgId: string,
  opts?: { boardId?: string; cardId?: string; minConfidence?: number }
): Promise<CardCrossDependencyLink[]> {
  const minC = typeof opts?.minConfidence === "number" ? opts.minConfidence : 0;
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    const q: Record<string, unknown> = { orgId, confidence: { $gte: minC } };
    if (opts?.boardId && opts?.cardId) {
      q.$or = [
        { sourceBoardId: opts.boardId, sourceCardId: opts.cardId },
        { targetBoardId: opts.boardId, targetCardId: opts.cardId },
      ];
    } else if (opts?.boardId) {
      q.$or = [{ sourceBoardId: opts.boardId }, { targetBoardId: opts.boardId }];
    }
    const cur = db.collection<CardCrossDependencyLink>(COL_CARD_CROSS_LINKS).find(q);
    return (await cur.toArray()) as CardCrossDependencyLink[];
  }
  return memLinks.filter((l) => {
    if (l.orgId !== orgId || l.confidence < minC) return false;
    if (opts?.boardId && opts?.cardId) {
      return (
        (l.sourceBoardId === opts.boardId && l.sourceCardId === opts.cardId) ||
        (l.targetBoardId === opts.boardId && l.targetCardId === opts.cardId)
      );
    }
    if (opts?.boardId) {
      return l.sourceBoardId === opts.boardId || l.targetBoardId === opts.boardId;
    }
    return true;
  });
}

export async function listDependencySuggestionsForOrg(
  orgId: string,
  opts?: { boardId?: string; minScore?: number; limit?: number }
): Promise<CardDependencySuggestion[]> {
  const minScore = typeof opts?.minScore === "number" ? opts.minScore : 0.85;
  const limit = typeof opts?.limit === "number" ? opts.limit : 200;
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    const q: Record<string, unknown> = { orgId, score: { $gte: minScore } };
    if (opts?.boardId) {
      q.$or = [{ boardIdA: opts.boardId }, { boardIdB: opts.boardId }];
    }
    return await db
      .collection<CardDependencySuggestion>(COL_CARD_DEP_SUGGESTIONS)
      .find(q)
      .sort({ score: -1 })
      .limit(limit)
      .toArray();
  }
  return memSugg
    .filter((s) => {
      if (s.orgId !== orgId || s.score < minScore) return false;
      if (opts?.boardId) return s.boardIdA === opts.boardId || s.boardIdB === opts.boardId;
      return true;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function replaceOrgDependencySuggestions(orgId: string, rows: Omit<CardDependencySuggestion, "_id">[]): Promise<void> {
  const now = new Date().toISOString();
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    const col = db.collection(COL_CARD_DEP_SUGGESTIONS);
    await col.deleteMany({ orgId });
    if (!rows.length) return;
    const docs: CardDependencySuggestion[] = rows.map((r, i) => ({
      _id: `cds_${orgId.slice(-6)}_${i}_${Date.now().toString(36)}`,
      ...r,
      orgId,
      updatedAt: r.updatedAt || now,
    }));
    await col.insertMany(docs as Document[]);
    return;
  }
  for (let i = memSugg.length - 1; i >= 0; i--) {
    if (memSugg[i].orgId === orgId) memSugg.splice(i, 1);
  }
  rows.forEach((r, i) => {
    memSugg.push({
      ...r,
      _id: `cds_mem_${i}`,
      orgId,
      updatedAt: r.updatedAt || now,
    });
  });
}

export async function upsertCardEmbedding(doc: Omit<CardTextEmbeddingDoc, "_id">): Promise<void> {
  const _id = `emb_${doc.orgId.slice(-4)}_${doc.boardId.slice(-6)}_${doc.cardId.slice(-8)}`;
  const full: CardTextEmbeddingDoc = { ...doc, _id };
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    await db.collection<CardTextEmbeddingDoc>(COL_CARD_TEXT_EMBEDDINGS).replaceOne(
      { orgId: doc.orgId, boardId: doc.boardId, cardId: doc.cardId },
      full,
      { upsert: true }
    );
    return;
  }
  memEmb.set(memEmbKey(doc.orgId, doc.boardId, doc.cardId), full);
}

export async function listEmbeddingsForOrgBoards(orgId: string, boardIds: string[]): Promise<CardTextEmbeddingDoc[]> {
  if (!boardIds.length) return [];
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    return await db
      .collection<CardTextEmbeddingDoc>(COL_CARD_TEXT_EMBEDDINGS)
      .find({ orgId, boardId: { $in: boardIds } })
      .toArray();
  }
  return [...memEmb.values()].filter((e) => e.orgId === orgId && boardIds.includes(e.boardId));
}

export async function deleteEmbeddingsForCards(
  orgId: string,
  pairs: Array<{ boardId: string; cardId: string }>
): Promise<void> {
  if (!pairs.length) return;
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    await db.collection(COL_CARD_TEXT_EMBEDDINGS).deleteMany({
      orgId,
      $or: pairs.map((p) => ({ boardId: p.boardId, cardId: p.cardId })),
    });
    return;
  }
  for (const p of pairs) {
    memEmb.delete(memEmbKey(orgId, p.boardId, p.cardId));
  }
}
