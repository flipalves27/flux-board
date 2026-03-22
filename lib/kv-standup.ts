import { getDb, isMongoConfigured } from "./mongo";
import type { Db } from "mongodb";
import { getStore } from "./storage";
import { sanitizeText } from "./schemas";

export type AsyncStandupEntry = {
  id: string;
  boardId: string;
  orgId: string;
  userId: string;
  userName: string;
  date: string;
  didYesterday: string;
  willToday: string;
  blockers: string;
  createdAt: string;
};

const COL_STANDUP = "async_standup_entries";

function kvKey(orgId: string, boardId: string, date: string, userId: string): string {
  return `standup:${orgId}:${boardId}:${date}:${userId}`;
}

function kvIndex(orgId: string, boardId: string, date: string): string {
  return `standup_index:${orgId}:${boardId}:${date}`;
}

function mkId(): string {
  return `std_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

let idxEnsured = false;
async function ensureIndexes(db: Db): Promise<void> {
  if (idxEnsured) return;
  await db.collection(COL_STANDUP).createIndex({ orgId: 1, boardId: 1, date: 1 });
  idxEnsured = true;
}

export async function upsertStandupEntry(params: {
  orgId: string;
  boardId: string;
  userId: string;
  userName: string;
  date: string;
  didYesterday: string;
  willToday: string;
  blockers: string;
}): Promise<AsyncStandupEntry> {
  const now = new Date().toISOString();
  const entry: AsyncStandupEntry = {
    id: mkId(),
    orgId: params.orgId,
    boardId: params.boardId,
    userId: params.userId,
    userName: sanitizeText(params.userName).slice(0, 200),
    date: String(params.date).slice(0, 10),
    didYesterday: sanitizeText(params.didYesterday).slice(0, 800),
    willToday: sanitizeText(params.willToday).slice(0, 800),
    blockers: sanitizeText(params.blockers).slice(0, 500),
    createdAt: now,
  };

  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    await db.collection(COL_STANDUP).replaceOne(
      { orgId: params.orgId, boardId: params.boardId, userId: params.userId, date: entry.date } as any,
      entry,
      { upsert: true }
    );
    return entry;
  }

  const store = await getStore();
  await store.set(kvKey(params.orgId, params.boardId, entry.date, params.userId), entry);
  const ids = ((await store.get<string[]>(kvIndex(params.orgId, params.boardId, entry.date))) as string[]) || [];
  if (!ids.includes(params.userId)) {
    ids.push(params.userId);
    await store.set(kvIndex(params.orgId, params.boardId, entry.date), ids);
  }
  return entry;
}

export async function listStandupEntries(orgId: string, boardId: string, date: string): Promise<AsyncStandupEntry[]> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    return db.collection<AsyncStandupEntry>(COL_STANDUP).find({ orgId, boardId, date } as any).toArray();
  }

  const store = await getStore();
  const userIds = ((await store.get<string[]>(kvIndex(orgId, boardId, date))) as string[]) || [];
  const out: AsyncStandupEntry[] = [];
  for (const uid of userIds) {
    const e = await store.get<AsyncStandupEntry>(kvKey(orgId, boardId, date, uid));
    if (e) out.push(e);
  }
  return out;
}
