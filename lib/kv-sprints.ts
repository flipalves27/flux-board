import { getDb, isMongoConfigured } from "./mongo";
import type { Db } from "mongodb";
import { getStore } from "./storage";
import { mergeBurndownSnapshotRow } from "./sprint-burndown-snapshot";
import { sanitizeText } from "./schemas";
import type { BurndownSnapshot, SprintData } from "./schemas";
import { parseScopeSnapshotFromDoc } from "./sprint-scope-snapshot";

export type { SprintData };

/** Legacy Mongo/KV docs may omit v6/v13 sprint fields. */
export function normalizeSprintData(raw: SprintData): SprintData {
  const cf =
    raw.customFields && typeof raw.customFields === "object" && !Array.isArray(raw.customFields)
      ? (raw.customFields as Record<string, string>)
      : {};
  return {
    ...raw,
    burndownSnapshots: raw.burndownSnapshots ?? [],
    addedMidSprint: raw.addedMidSprint ?? [],
    removedCardIds: raw.removedCardIds ?? [],
    cadenceType: raw.cadenceType ?? "timebox",
    reviewCadenceDays: raw.reviewCadenceDays ?? null,
    wipPolicyNote: raw.wipPolicyNote ?? "",
    plannedCapacity: raw.plannedCapacity ?? null,
    commitmentNote: raw.commitmentNote ?? "",
    definitionOfDoneItemIds: raw.definitionOfDoneItemIds ?? [],
    sprintGoalHistory: raw.sprintGoalHistory ?? [],
    programIncrementId: raw.programIncrementId ?? null,
    sprintTags: raw.sprintTags ?? [],
    customFields: cf,
    scopeSnapshot: parseScopeSnapshotFromDoc(raw.scopeSnapshot as unknown),
  };
}

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

function sanitizeCustomFields(raw: Record<string, string> | undefined): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = sanitizeText(k).trim().slice(0, 60);
    if (!key) continue;
    out[key] = sanitizeText(String(v)).trim().slice(0, 500);
  }
  return out;
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
    return docs.map(normalizeSprintData);
  }
  const store = await getStore();
  const ids = ((await store.get<string[]>(kvIndexSprintsByBoard(orgId, boardId))) as string[]) || [];
  const out: SprintData[] = [];
  for (const id of ids) {
    const raw = await store.get<SprintData>(kvKeySprint(orgId, id));
    if (raw) out.push(normalizeSprintData(raw));
  }
  out.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return out;
}

export async function getActiveSprint(orgId: string, boardId: string): Promise<SprintData | null> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureSprintIndexes(db);
    const doc = await db.collection<SprintData>(COL_SPRINTS).findOne({ orgId, boardId, status: "active" } as any);
    return doc ? normalizeSprintData(doc) : null;
  }
  const sprints = await listSprints(orgId, boardId);
  return sprints.find((s) => s.status === "active") ?? null;
}

export async function getSprint(orgId: string, sprintId: string): Promise<SprintData | null> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureSprintIndexes(db);
    const doc = await db.collection<SprintData>(COL_SPRINTS).findOne({ orgId, id: sprintId } as any);
    return doc ? normalizeSprintData(doc) : null;
  }
  const store = await getStore();
  const raw = await store.get<SprintData>(kvKeySprint(orgId, sprintId));
  return raw ? normalizeSprintData(raw) : null;
}

export async function createSprint(params: {
  orgId: string;
  boardId: string;
  name: string;
  goal?: string;
  startDate?: string | null;
  endDate?: string | null;
  cardIds?: string[];
  cadenceType?: SprintData["cadenceType"];
  reviewCadenceDays?: number | null;
  wipPolicyNote?: string;
  plannedCapacity?: number | null;
  commitmentNote?: string;
  definitionOfDoneItemIds?: string[];
  programIncrementId?: string | null;
  sprintTags?: string[];
  customFields?: Record<string, string>;
}): Promise<SprintData> {
  const now = new Date().toISOString();
  const id = mkId();
  const goalTrim = sanitizeText(params.goal ?? "").trim().slice(0, 1000);
  const sprint: SprintData = {
    id,
    orgId: params.orgId,
    boardId: params.boardId,
    name: sanitizeText(params.name).trim().slice(0, 200),
    goal: goalTrim,
    status: "planning",
    startDate: params.startDate ?? null,
    endDate: params.endDate ?? null,
    velocity: null,
    cardIds: params.cardIds ?? [],
    doneCardIds: [],
    ceremonyIds: [],
    burndownSnapshots: [],
    addedMidSprint: [],
    removedCardIds: [],
    cadenceType: params.cadenceType ?? "timebox",
    reviewCadenceDays: params.reviewCadenceDays ?? null,
    wipPolicyNote: sanitizeText(params.wipPolicyNote ?? "").trim().slice(0, 500),
    plannedCapacity: params.plannedCapacity ?? null,
    commitmentNote: sanitizeText(params.commitmentNote ?? "").trim().slice(0, 1000),
    definitionOfDoneItemIds: params.definitionOfDoneItemIds?.slice(0, 20) ?? [],
    sprintGoalHistory: goalTrim ? [{ at: now, goal: goalTrim }] : [],
    programIncrementId: params.programIncrementId?.trim().slice(0, 200) || null,
    sprintTags: (params.sprintTags ?? []).map((t) => sanitizeText(t).trim().slice(0, 60)).filter(Boolean).slice(0, 20),
    customFields: sanitizeCustomFields(params.customFields),
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
  updates: Partial<
    Pick<
      SprintData,
      | "name"
      | "goal"
      | "startDate"
      | "endDate"
      | "status"
      | "cardIds"
      | "doneCardIds"
      | "velocity"
      | "ceremonyIds"
      | "burndownSnapshots"
      | "addedMidSprint"
      | "removedCardIds"
      | "cadenceType"
      | "reviewCadenceDays"
      | "wipPolicyNote"
      | "plannedCapacity"
      | "commitmentNote"
      | "definitionOfDoneItemIds"
      | "sprintGoalHistory"
      | "programIncrementId"
      | "sprintTags"
      | "customFields"
      | "scopeSnapshot"
    >
  >
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
    ...(updates.burndownSnapshots !== undefined ? { burndownSnapshots: updates.burndownSnapshots } : {}),
    ...(updates.addedMidSprint !== undefined ? { addedMidSprint: updates.addedMidSprint } : {}),
    ...(updates.removedCardIds !== undefined ? { removedCardIds: updates.removedCardIds } : {}),
    ...(updates.cadenceType !== undefined ? { cadenceType: updates.cadenceType } : {}),
    ...(updates.reviewCadenceDays !== undefined ? { reviewCadenceDays: updates.reviewCadenceDays } : {}),
    ...(updates.wipPolicyNote !== undefined
      ? { wipPolicyNote: sanitizeText(updates.wipPolicyNote).trim().slice(0, 500) }
      : {}),
    ...(updates.plannedCapacity !== undefined ? { plannedCapacity: updates.plannedCapacity } : {}),
    ...(updates.commitmentNote !== undefined
      ? { commitmentNote: sanitizeText(updates.commitmentNote).trim().slice(0, 1000) }
      : {}),
    ...(updates.definitionOfDoneItemIds !== undefined
      ? { definitionOfDoneItemIds: updates.definitionOfDoneItemIds.slice(0, 20) }
      : {}),
    ...(updates.sprintGoalHistory !== undefined ? { sprintGoalHistory: updates.sprintGoalHistory.slice(0, 30) } : {}),
    ...(updates.programIncrementId !== undefined
      ? { programIncrementId: updates.programIncrementId ? updates.programIncrementId.trim().slice(0, 200) : null }
      : {}),
    ...(updates.sprintTags !== undefined
      ? {
          sprintTags: updates.sprintTags
            .map((t) => sanitizeText(t).trim().slice(0, 60))
            .filter(Boolean)
            .slice(0, 20),
        }
      : {}),
    ...(updates.customFields !== undefined ? { customFields: sanitizeCustomFields(updates.customFields) } : {}),
    ...(updates.scopeSnapshot !== undefined ? { scopeSnapshot: updates.scopeSnapshot } : {}),
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

export async function appendBurndownSnapshot(
  orgId: string,
  sprintId: string,
  row: BurndownSnapshot
): Promise<SprintData | null> {
  const existing = await getSprint(orgId, sprintId);
  if (!existing) return null;
  const burndownSnapshots = mergeBurndownSnapshotRow(existing.burndownSnapshots, row);
  return updateSprint(orgId, sprintId, { burndownSnapshots });
}

/** List active sprints (Mongo only). Used by cron jobs. */
export async function listActiveSprintsAllOrgs(): Promise<SprintData[]> {
  if (!isMongoConfigured()) return [];
  const db = await getDb();
  await ensureSprintIndexes(db);
  const docs = await db.collection<SprintData>(COL_SPRINTS).find({ status: "active" } as any).toArray();
  return docs.map(normalizeSprintData);
}
