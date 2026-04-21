import { getDb, isMongoConfigured } from "./mongo";
import type { Db } from "mongodb";
import { getStore } from "./storage";
import type { ProgramIncrementData } from "./schemas";

export type { ProgramIncrementData };

const COL_PI = "program_increments";

function kvKeyPI(orgId: string, piId: string): string {
  return `pi:${orgId}:${piId}`;
}

function kvIndexPIsByOrg(orgId: string): string {
  return `pi_index:org:${orgId}`;
}

function mkId(): string {
  return `pi_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

let piIndexEnsured = false;
async function ensurePIIndexes(db: Db): Promise<void> {
  if (piIndexEnsured) return;
  await db.collection(COL_PI).createIndex({ orgId: 1 });
  await db.collection(COL_PI).createIndex({ orgId: 1, status: 1 });
  piIndexEnsured = true;
}

export async function listProgramIncrements(orgId: string): Promise<ProgramIncrementData[]> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensurePIIndexes(db);
    const docs = await db.collection<ProgramIncrementData>(COL_PI).find({ orgId } as any).toArray();
    docs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return docs;
  }
  const store = await getStore();
  const ids = ((await store.get<string[]>(kvIndexPIsByOrg(orgId))) as string[]) || [];
  const out: ProgramIncrementData[] = [];
  for (const id of ids) {
    const raw = await store.get<ProgramIncrementData>(kvKeyPI(orgId, id));
    if (raw) out.push(raw);
  }
  out.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return out;
}

export async function getActiveProgramIncrement(orgId: string): Promise<ProgramIncrementData | null> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensurePIIndexes(db);
    const doc = await db.collection<ProgramIncrementData>(COL_PI).findOne({ orgId, status: "executing" } as any);
    return doc || null;
  }
  const pis = await listProgramIncrements(orgId);
  return pis.find((p) => p.status === "executing") ?? null;
}

export async function getProgramIncrement(orgId: string, piId: string): Promise<ProgramIncrementData | null> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensurePIIndexes(db);
    const doc = await db.collection<ProgramIncrementData>(COL_PI).findOne({ orgId, id: piId } as any);
    return doc || null;
  }
  const store = await getStore();
  return store.get<ProgramIncrementData>(kvKeyPI(orgId, piId));
}

export async function createProgramIncrement(
  orgId: string,
  input: Omit<ProgramIncrementData, "id" | "orgId" | "createdAt" | "updatedAt">
): Promise<ProgramIncrementData> {
  const now = new Date().toISOString();
  const pi: ProgramIncrementData = {
    id: mkId(),
    orgId,
    ...input,
    createdAt: now,
    updatedAt: now,
  };

  if (isMongoConfigured()) {
    const db = await getDb();
    await ensurePIIndexes(db);
    await db.collection(COL_PI).insertOne({ ...pi } as any);
    return pi;
  }

  const store = await getStore();
  await store.set(kvKeyPI(orgId, pi.id), pi);
  const ids = ((await store.get<string[]>(kvIndexPIsByOrg(orgId))) as string[]) || [];
  if (!ids.includes(pi.id)) {
    await store.set(kvIndexPIsByOrg(orgId), [...ids, pi.id]);
  }
  return pi;
}

export async function updateProgramIncrement(
  orgId: string,
  piId: string,
  patch: Partial<Omit<ProgramIncrementData, "id" | "orgId" | "createdAt">>
): Promise<ProgramIncrementData | null> {
  const now = new Date().toISOString();

  if (isMongoConfigured()) {
    const db = await getDb();
    await ensurePIIndexes(db);
    const result = await db.collection<ProgramIncrementData>(COL_PI).findOneAndUpdate(
      { orgId, id: piId } as any,
      { $set: { ...patch, updatedAt: now } },
      { returnDocument: "after" }
    );
    return result as ProgramIncrementData | null;
  }

  const existing = await getProgramIncrement(orgId, piId);
  if (!existing) return null;
  const updated: ProgramIncrementData = { ...existing, ...patch, updatedAt: now };
  const store = await getStore();
  await store.set(kvKeyPI(orgId, piId), updated);
  return updated;
}

export async function deleteProgramIncrement(orgId: string, piId: string): Promise<boolean> {
  if (isMongoConfigured()) {
    const db = await getDb();
    const result = await db.collection(COL_PI).deleteOne({ orgId, id: piId } as any);
    return result.deletedCount > 0;
  }
  const store = await getStore();
  const existing = await getProgramIncrement(orgId, piId);
  if (!existing) return false;
  await store.set(kvKeyPI(orgId, piId), null);
  const ids = ((await store.get<string[]>(kvIndexPIsByOrg(orgId))) as string[]) || [];
  await store.set(kvIndexPIsByOrg(orgId), ids.filter((i) => i !== piId));
  return true;
}
