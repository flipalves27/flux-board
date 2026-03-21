import { getDb, isMongoConfigured } from "./mongo";
import { getStore } from "./storage";
import { sanitizeText } from "./schemas";
import type { Db } from "mongodb";

const COL = "board_nlq_recent_queries";
const MAX_QUERIES = 10;

type NlqRecentDoc = {
  _id: string;
  orgId: string;
  userId: string;
  boardId: string;
  queries: string[];
  updatedAt: string;
};

function docId(orgId: string, userId: string, boardId: string): string {
  return `${orgId}:${userId}:${boardId}`;
}

function kvKey(orgId: string, userId: string, boardId: string): string {
  return `board_nlq_recent:${orgId}:${userId}:${boardId}`;
}

async function ensureIndexes(db: Db): Promise<void> {
  const col = db.collection(COL);
  await col.createIndex({ orgId: 1, userId: 1, boardId: 1 }, { unique: true });
}

export async function getBoardNlqRecentQueries(params: {
  orgId: string;
  userId: string;
  boardId: string;
}): Promise<string[]> {
  const { orgId, userId, boardId } = params;

  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    const col = db.collection<NlqRecentDoc>(COL);
    const doc = await col.findOne({ orgId, userId, boardId });
    return Array.isArray(doc?.queries) ? doc.queries : [];
  }

  const store = await getStore();
  const raw = await store.get<{ queries: string[] }>(kvKey(orgId, userId, boardId));
  return Array.isArray(raw?.queries) ? raw.queries : [];
}

/** Adiciona `query` ao topo, deduplica, mantém no máximo MAX_QUERIES. */
export async function pushBoardNlqRecentQuery(params: {
  orgId: string;
  userId: string;
  boardId: string;
  query: string;
}): Promise<string[]> {
  const { orgId, userId, boardId } = params;
  const q = sanitizeText(params.query).trim().slice(0, 500);
  if (!q) return getBoardNlqRecentQueries({ orgId, userId, boardId });

  const prev = await getBoardNlqRecentQueries({ orgId, userId, boardId });
  const next = [q, ...prev.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, MAX_QUERIES);
  const updatedAt = new Date().toISOString();

  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    const col = db.collection<NlqRecentDoc>(COL);
    await col.updateOne(
      { orgId, userId, boardId },
      {
        $set: { queries: next, updatedAt },
        $setOnInsert: { _id: docId(orgId, userId, boardId), orgId, userId, boardId },
      },
      { upsert: true }
    );
    return next;
  }

  const store = await getStore();
  await store.set(kvKey(orgId, userId, boardId), { queries: next, updatedAt });
  return next;
}
