import { getDb, isMongoConfigured } from "./mongo";
import type { Db } from "mongodb";
import { getStore } from "./storage";
import { sanitizeText } from "./schemas";
import type { TimeEntryData } from "./schemas";

export type { TimeEntryData };

const COL_TIME_ENTRIES = "time_entries";

function kvKey(orgId: string, entryId: string): string {
  return `time_entry:${orgId}:${entryId}`;
}

function kvIndex(orgId: string, boardId: string, cardId: string): string {
  return `time_entries_index:${orgId}:${boardId}:${cardId}`;
}

function kvIndexUser(orgId: string, userId: string, date: string): string {
  return `time_entries_user:${orgId}:${userId}:${date}`;
}

function mkId(): string {
  return `te_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

let idxEnsured = false;
async function ensureIndexes(db: Db): Promise<void> {
  if (idxEnsured) return;
  await db.collection(COL_TIME_ENTRIES).createIndex({ orgId: 1, boardId: 1, cardId: 1 });
  await db.collection(COL_TIME_ENTRIES).createIndex({ orgId: 1, userId: 1, startedAt: 1 });
  idxEnsured = true;
}

export async function listTimeEntries(orgId: string, boardId: string, cardId: string): Promise<TimeEntryData[]> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    return db.collection<TimeEntryData>(COL_TIME_ENTRIES).find({ orgId, boardId, cardId } as any).toArray();
  }
  const store = await getStore();
  const ids = ((await store.get<string[]>(kvIndex(orgId, boardId, cardId))) as string[]) || [];
  const out: TimeEntryData[] = [];
  for (const id of ids) {
    const e = await store.get<TimeEntryData>(kvKey(orgId, id));
    if (e) out.push(e);
  }
  return out;
}

export async function createTimeEntry(params: {
  orgId: string;
  boardId: string;
  cardId: string;
  userId: string;
  startedAt?: string;
  subtaskId?: string | null;
  note?: string;
}): Promise<TimeEntryData> {
  const now = new Date().toISOString();
  const id = mkId();
  const entry: TimeEntryData = {
    id,
    cardId: params.cardId,
    boardId: params.boardId,
    orgId: params.orgId,
    subtaskId: params.subtaskId ?? null,
    userId: params.userId,
    startedAt: params.startedAt ?? now,
    endedAt: null,
    durationMinutes: 0,
    note: sanitizeText(params.note ?? "").slice(0, 500),
  };

  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    await db.collection(COL_TIME_ENTRIES).insertOne(entry as any);
    return entry;
  }

  const store = await getStore();
  await store.set(kvKey(params.orgId, id), entry);
  const ids = ((await store.get<string[]>(kvIndex(params.orgId, params.boardId, params.cardId))) as string[]) || [];
  if (!ids.includes(id)) {
    ids.push(id);
    await store.set(kvIndex(params.orgId, params.boardId, params.cardId), ids);
  }
  return entry;
}

export async function stopTimeEntry(orgId: string, entryId: string, cardId: string): Promise<TimeEntryData | null> {
  const now = new Date().toISOString();

  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    const entry = await db.collection<TimeEntryData>(COL_TIME_ENTRIES).findOne({ orgId, id: entryId } as any);
    if (!entry) return null;
    const durationMinutes = Math.max(0, Math.round((new Date(now).getTime() - new Date(entry.startedAt).getTime()) / 60000));
    const updated = { ...entry, endedAt: now, durationMinutes };
    await db.collection(COL_TIME_ENTRIES).replaceOne({ orgId, id: entryId } as any, updated);
    return updated;
  }

  const store = await getStore();
  const entry = await store.get<TimeEntryData>(kvKey(orgId, entryId));
  if (!entry) return null;
  const durationMinutes = Math.max(0, Math.round((new Date(now).getTime() - new Date(entry.startedAt).getTime()) / 60000));
  const updated = { ...entry, endedAt: now, durationMinutes };
  await store.set(kvKey(orgId, entryId), updated);
  return updated;
}

export async function getUserDailyMinutes(orgId: string, userId: string): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureIndexes(db);
    const entries = await db.collection<TimeEntryData>(COL_TIME_ENTRIES)
      .find({ orgId, userId, startedAt: { $gte: today } } as any)
      .toArray();
    return entries.reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);
  }
  return 0;
}
