import { getDb, isMongoConfigured } from "./mongo";
import type { Db } from "mongodb";
import { getStore } from "./storage";
import { sanitizeText } from "./schemas";
import type { SprintData } from "./schemas";

export type { SprintData };

const COL_SPRINTS = "sprints";

function kvKeySprint(orgId: string, sprintId: string): string {
  return `sprint:${orgId}:${sprintId}`;
}

function kvIndexSprintsByBoard(orgId: string, boardId: string): string {
  return `sprints_index:board:${orgId}:${boardId}`;
}

function mkId(): string {
  return `spr_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

let sprintsIndexEnsured = false;
async function ensureSprintIndexes(db: Db): Promise<void> {
  if (sprintsIndexEnsured) return;
  await db.collection(COL_SPRINTS).createIndex({ orgId: 1, boardId: 1 });
  await db.collection(COL_SPRINTS).createIndex({ orgId: 1, status: 1 });
  sprintsIndexEnsured = true;
}

export async function listSprints(orgId: string, boardId: string): Promise<SprintData[]> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureSprintIndexes(db);
    const docs = await db.collection<SprintData>(COL_SPRINTS).find({ orgId, boardId } as any).toArray();
    docs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return docs;
  }
  const store = await getStore();
  const ids = ((await store.get<string[]>(kvIndexSprintsByBoard(orgId, boardId))) as string[]) || [];
  const out: SprintData[] = [];
  for (const id of ids) {
    const raw = await store.get<SprintData>(kvKeySprint(orgId, id));
    if (raw) out.push(raw);
  }
  out.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return out;
}

export async function getActiveSprint(orgId: string, boardId: string): Promise<SprintData | null> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureSprintIndexes(db);
    const doc = await db.collection<SprintData>(COL_SPRINTS).findOne({ orgId, boardId, status: "active" } as any);
    return doc || null;
  }
  const sprints = await listSprints(orgId, boardId);
  return sprints.find((s) => s.status === "active") ?? null;
}

export async function getSprint(orgId: string, sprintId: string): Promise<SprintData | null> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureSprintIndexes(db);
    const doc = await db.collection<SprintData>(COL_SPRINTS).findOne({ orgId, id: sprintId } as any);
    return doc || null;
  }
  const store = await getStore();
  return (await store.get<SprintData>(kvKeySprint(orgId, sprintId))) ?? null;
}

export async function createSprint(params: {
  orgId: string;
  boardId: string;
  name: string;
  goal?: string;
  startDate?: string | null;
  endDate?: string | null;
  cardIds?: string[];
}): Promise<SprintData> {
  const now = new Date().toISOString();
  const id = mkId();
  const sprint: SprintData = {
    id,
    orgId: params.orgId,
    boardId: params.boardId,
    name: sanitizeText(params.name).trim().slice(0, 200),
    goal: sanitizeText(params.goal ?? "").trim().slice(0, 1000),
    status: "planning",
    startDate: params.startDate ?? null,
    endDate: params.endDate ?? null,
    velocity: null,
    cardIds: params.cardIds ?? [],
    doneCardIds: [],
    ceremonyIds: [],
    createdAt: now,
    updatedAt: now,
  };

  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureSprintIndexes(db);
    await db.collection(COL_SPRINTS).insertOne(sprint as any);
    return sprint;
  }

  const store = await getStore();
  await store.set(kvKeySprint(params.orgId, id), sprint);
  const ids = ((await store.get<string[]>(kvIndexSprintsByBoard(params.orgId, params.boardId))) as string[]) || [];
  if (!ids.includes(id)) {
    ids.unshift(id);
    await store.set(kvIndexSprintsByBoard(params.orgId, params.boardId), ids);
  }
  return sprint;
}

export async function updateSprint(
  orgId: string,
  sprintId: string,
  updates: Partial<Pick<SprintData, "name" | "goal" | "startDate" | "endDate" | "status" | "cardIds" | "doneCardIds" | "velocity" | "ceremonyIds">>
): Promise<SprintData | null> {
  const existing = await getSprint(orgId, sprintId);
  if (!existing) return null;

  const next: SprintData = {
    ...existing,
    ...(updates.name !== undefined ? { name: sanitizeText(updates.name).trim().slice(0, 200) } : {}),
    ...(updates.goal !== undefined ? { goal: sanitizeText(updates.goal).trim().slice(0, 1000) } : {}),
    ...(updates.startDate !== undefined ? { startDate: updates.startDate } : {}),
    ...(updates.endDate !== undefined ? { endDate: updates.endDate } : {}),
    ...(updates.status !== undefined ? { status: updates.status } : {}),
    ...(updates.cardIds !== undefined ? { cardIds: updates.cardIds } : {}),
    ...(updates.doneCardIds !== undefined ? { doneCardIds: updates.doneCardIds } : {}),
    ...(updates.velocity !== undefined ? { velocity: updates.velocity } : {}),
    ...(updates.ceremonyIds !== undefined ? { ceremonyIds: updates.ceremonyIds } : {}),
    updatedAt: new Date().toISOString(),
  };

  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureSprintIndexes(db);
    await db.collection(COL_SPRINTS).replaceOne({ orgId, id: sprintId }, next as any);
    return next;
  }

  const store = await getStore();
  await store.set(kvKeySprint(orgId, sprintId), next);
  return next;
}

export async function deleteSprint(orgId: string, boardId: string, sprintId: string): Promise<boolean> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureSprintIndexes(db);
    const res = await db.collection(COL_SPRINTS).deleteOne({ orgId, id: sprintId });
    return res.deletedCount > 0;
  }

  const store = await getStore();
  const existing = await store.get<SprintData>(kvKeySprint(orgId, sprintId));
  if (!existing) return false;
  await store.del(kvKeySprint(orgId, sprintId));
  const ids = ((await store.get<string[]>(kvIndexSprintsByBoard(orgId, boardId))) as string[]) || [];
  await store.set(kvIndexSprintsByBoard(orgId, boardId), ids.filter((id) => id !== sprintId));
  return true;
}
