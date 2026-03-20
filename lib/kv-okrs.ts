import { getDb, isMongoConfigured } from "./mongo";
import type { Db } from "mongodb";
import { getStore } from "./storage";
import { sanitizeText } from "./schemas";

export type OkrsMetricType = "card_count" | "card_in_column" | "Manual";

export type OkrsStatus = "Não iniciado" | "Em andamento" | "Concluída";

export type OkrsObjective = {
  id: string;
  orgId: string;
  owner?: string | null;
  title: string;
  quarter: string;
  createdAt: string;
  updatedAt: string;
};

export type OkrsKeyResult = {
  id: string;
  orgId: string;
  objectiveId: string;
  title: string;
  metric_type: OkrsMetricType;
  target: number;
  linkedBoardId: string;
  linkedColumnKey?: string | null;
  manualCurrent?: number | null;
  createdAt: string;
  updatedAt: string;
};

const COL_OBJECTIVES = "okrs_objectives";
const COL_KEY_RESULTS = "okrs_key_results";

function kvKeyObjective(orgId: string, objectiveId: string): string {
  return `okr_objective:${orgId}:${objectiveId}`;
}

function kvKeyKeyResult(orgId: string, krId: string): string {
  return `okr_key_result:${orgId}:${krId}`;
}

function kvIndexObjectives(orgId: string): string {
  return `okr_objectives_index:${orgId}`;
}

function kvIndexKeyResultsByObjective(orgId: string, objectiveId: string): string {
  return `okr_krs_index_by_objective:${orgId}:${objectiveId}`;
}

function kvIndexKeyResultsByBoard(orgId: string, boardId: string): string {
  return `okr_krs_index_by_board:${orgId}:${boardId}`;
}

function mkId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

let okrsIndexesEnsured = false;
async function ensureOkrsIndexes(db: Db): Promise<void> {
  if (okrsIndexesEnsured) return;
  await db.collection(COL_OBJECTIVES).createIndex({ orgId: 1, quarter: 1 });
  await db.collection(COL_KEY_RESULTS).createIndex({ orgId: 1, objectiveId: 1 });
  await db.collection(COL_KEY_RESULTS).createIndex({ orgId: 1, linkedBoardId: 1 });
  okrsIndexesEnsured = true;
}

export async function listObjectives(orgId: string, quarter?: string | null): Promise<OkrsObjective[]> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureOkrsIndexes(db);
    const filter: Record<string, unknown> = { orgId };
    if (quarter) filter.quarter = String(quarter);
    const docs = await db.collection<OkrsObjective>(COL_OBJECTIVES).find(filter as any).toArray();
    docs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return docs;
  }

  const store = await getStore();
  const ids = ((await store.get<string[]>(kvIndexObjectives(orgId))) as string[]) || [];
  const out: OkrsObjective[] = [];
  for (const id of ids) {
    const raw = await store.get<OkrsObjective>(kvKeyObjective(orgId, id));
    if (!raw) continue;
    if (quarter && raw.quarter !== quarter) continue;
    out.push(raw);
  }
  out.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return out;
}

export async function getObjective(orgId: string, objectiveId: string): Promise<OkrsObjective | null> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureOkrsIndexes(db);
    const obj = await db.collection<OkrsObjective>(COL_OBJECTIVES).findOne({ orgId, id: objectiveId } as any);
    return obj || null;
  }
  const store = await getStore();
  const raw = await store.get<OkrsObjective>(kvKeyObjective(orgId, objectiveId));
  return raw || null;
}

export async function createObjective(params: {
  orgId: string;
  ownerId?: string;
  title: string;
  quarter: string;
}): Promise<OkrsObjective> {
  const now = new Date().toISOString();
  const id = mkId("okr_obj");
  const objective: OkrsObjective = {
    id,
    orgId: params.orgId,
    owner: params.ownerId ?? null,
    title: sanitizeText(params.title).trim().slice(0, 200),
    quarter: String(params.quarter).trim().slice(0, 50),
    createdAt: now,
    updatedAt: now,
  };

  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureOkrsIndexes(db);
    await db.collection(COL_OBJECTIVES).insertOne(objective as any);
    return objective;
  }

  const store = await getStore();
  await store.set(kvKeyObjective(params.orgId, id), objective);
  const ids = ((await store.get<string[]>(kvIndexObjectives(params.orgId))) as string[]) || [];
  if (!ids.includes(id)) {
    ids.unshift(id);
    await store.set(kvIndexObjectives(params.orgId), ids);
  }
  return objective;
}

export async function deleteObjective(orgId: string, objectiveId: string): Promise<boolean> {
  // MVP: apagar o objetivo e todos KRs associados.
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureOkrsIndexes(db);
    const krRes = await db.collection(COL_KEY_RESULTS).deleteMany({ orgId, objectiveId });
    const objRes = await db.collection(COL_OBJECTIVES).deleteOne({ orgId, id: objectiveId });
    return objRes.deletedCount > 0 && krRes.deletedCount >= 0;
  }

  const store = await getStore();
  const ids = ((await store.get<string[]>(kvIndexKeyResultsByObjective(orgId, objectiveId))) as string[]) || [];
  for (const krId of ids) {
    const existing = await store.get<OkrsKeyResult>(kvKeyKeyResult(orgId, krId));
    await store.del(kvKeyKeyResult(orgId, krId));
    if (existing?.linkedBoardId) {
      const byBoard = ((await store.get<string[]>(kvIndexKeyResultsByBoard(orgId, existing.linkedBoardId))) as string[]) || [];
      await store.set(
        kvIndexKeyResultsByBoard(orgId, existing.linkedBoardId),
        byBoard.filter((id) => id !== krId)
      );
    }
  }
  await store.del(kvIndexKeyResultsByObjective(orgId, objectiveId));
  await store.del(kvKeyObjective(orgId, objectiveId));

  const objIds = ((await store.get<string[]>(kvIndexObjectives(orgId))) as string[]) || [];
  await store.set(kvIndexObjectives(orgId), objIds.filter((id) => id !== objectiveId));
  return true;
}

export async function updateObjective(
  orgId: string,
  objectiveId: string,
  updates: { title?: string; owner?: string | null; quarter?: string }
): Promise<OkrsObjective | null> {
  const existing = await getObjective(orgId, objectiveId);
  if (!existing) return null;

  const next: OkrsObjective = {
    ...existing,
    title:
      updates.title !== undefined
        ? sanitizeText(updates.title).trim().slice(0, 200)
        : existing.title,
    owner:
      updates.owner !== undefined
        ? (updates.owner ? sanitizeText(updates.owner).trim().slice(0, 200) : null)
        : existing.owner ?? null,
    quarter:
      updates.quarter !== undefined
        ? String(updates.quarter).trim().slice(0, 50)
        : existing.quarter,
    updatedAt: new Date().toISOString(),
  };

  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureOkrsIndexes(db);
    await db.collection(COL_OBJECTIVES).replaceOne({ orgId, id: objectiveId }, next as any);
    return next;
  }

  const store = await getStore();
  await store.set(kvKeyObjective(orgId, objectiveId), next);
  return next;
}

export async function createKeyResult(params: {
  orgId: string;
  objectiveId: string;
  title: string;
  metric_type: OkrsMetricType;
  target: number;
  linkedBoardId: string;
  linkedColumnKey?: string | null;
  manualCurrent?: number | null;
}): Promise<OkrsKeyResult> {
  const now = new Date().toISOString();
  const id = mkId("okr_kr");
  const kr: OkrsKeyResult = {
    id,
    orgId: params.orgId,
    objectiveId: params.objectiveId,
    title: sanitizeText(params.title).trim().slice(0, 200),
    metric_type: params.metric_type,
    target: Number.isFinite(params.target) ? Math.max(0, params.target) : 0,
    linkedBoardId: String(params.linkedBoardId).trim(),
    linkedColumnKey:
      params.metric_type === "card_in_column" ? sanitizeText(params.linkedColumnKey ?? "").trim().slice(0, 200) : params.linkedColumnKey ?? null,
    manualCurrent:
      params.metric_type === "Manual" ? (Number.isFinite(params.manualCurrent as number) ? Math.max(0, Number(params.manualCurrent)) : 0) : null,
    createdAt: now,
    updatedAt: now,
  };

  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureOkrsIndexes(db);
    await db.collection(COL_KEY_RESULTS).insertOne(kr as any);
    return kr;
  }

  const store = await getStore();
  await store.set(kvKeyKeyResult(params.orgId, id), kr);

  const byObj = ((await store.get<string[]>(kvIndexKeyResultsByObjective(params.orgId, params.objectiveId))) as string[]) || [];
  if (!byObj.includes(id)) {
    byObj.unshift(id);
    await store.set(kvIndexKeyResultsByObjective(params.orgId, params.objectiveId), byObj);
  }

  const byBoard = ((await store.get<string[]>(kvIndexKeyResultsByBoard(params.orgId, kr.linkedBoardId))) as string[]) || [];
  if (!byBoard.includes(id)) {
    byBoard.unshift(id);
    await store.set(kvIndexKeyResultsByBoard(params.orgId, kr.linkedBoardId), byBoard);
  }

  return kr;
}

export async function deleteKeyResult(orgId: string, krId: string): Promise<boolean> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureOkrsIndexes(db);
    const res = await db.collection(COL_KEY_RESULTS).deleteOne({ orgId, id: krId });
    return res.deletedCount > 0;
  }

  const store = await getStore();
  const existing = await store.get<OkrsKeyResult>(kvKeyKeyResult(orgId, krId));
  if (!existing) return false;

  await store.del(kvKeyKeyResult(orgId, krId));

  const byObj = ((await store.get<string[]>(kvIndexKeyResultsByObjective(orgId, existing.objectiveId))) as string[]) || [];
  await store.set(kvIndexKeyResultsByObjective(orgId, existing.objectiveId), byObj.filter((id) => id !== krId));

  const byBoard = ((await store.get<string[]>(kvIndexKeyResultsByBoard(orgId, existing.linkedBoardId))) as string[]) || [];
  await store.set(kvIndexKeyResultsByBoard(orgId, existing.linkedBoardId), byBoard.filter((id) => id !== krId));
  return true;
}

export async function getKeyResult(orgId: string, krId: string): Promise<OkrsKeyResult | null> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureOkrsIndexes(db);
    const kr = await db.collection<OkrsKeyResult>(COL_KEY_RESULTS).findOne({ orgId, id: krId } as any);
    return kr || null;
  }
  const store = await getStore();
  const raw = await store.get<OkrsKeyResult>(kvKeyKeyResult(orgId, krId));
  return raw || null;
}

export async function updateKeyResult(
  orgId: string,
  krId: string,
  updates: {
    title?: string;
    metric_type?: OkrsMetricType;
    target?: number;
    linkedBoardId?: string;
    linkedColumnKey?: string | null;
    manualCurrent?: number | null;
  }
): Promise<OkrsKeyResult | null> {
  const existing = await getKeyResult(orgId, krId);
  if (!existing) return null;

  const metric_type = updates.metric_type ?? existing.metric_type;
  const linkedBoardId = updates.linkedBoardId !== undefined ? String(updates.linkedBoardId).trim() : existing.linkedBoardId;
  const linkedColumnKey =
    metric_type === "card_in_column"
      ? sanitizeText(updates.linkedColumnKey ?? existing.linkedColumnKey ?? "").trim().slice(0, 200)
      : null;
  const manualCurrent =
    metric_type === "Manual"
      ? Number.isFinite(updates.manualCurrent as number)
        ? Math.max(0, Number(updates.manualCurrent))
        : Number.isFinite(existing.manualCurrent as number)
          ? Math.max(0, Number(existing.manualCurrent))
          : 0
      : null;

  const next: OkrsKeyResult = {
    ...existing,
    title:
      updates.title !== undefined
        ? sanitizeText(updates.title).trim().slice(0, 200)
        : existing.title,
    metric_type,
    target:
      updates.target !== undefined
        ? (Number.isFinite(updates.target) ? Math.max(0, updates.target) : existing.target)
        : existing.target,
    linkedBoardId,
    linkedColumnKey,
    manualCurrent,
    updatedAt: new Date().toISOString(),
  };

  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureOkrsIndexes(db);
    await db.collection(COL_KEY_RESULTS).replaceOne({ orgId, id: krId }, next as any);
    return next;
  }

  const store = await getStore();
  await store.set(kvKeyKeyResult(orgId, krId), next);

  if (existing.linkedBoardId !== next.linkedBoardId) {
    const oldByBoard = ((await store.get<string[]>(kvIndexKeyResultsByBoard(orgId, existing.linkedBoardId))) as string[]) || [];
    await store.set(kvIndexKeyResultsByBoard(orgId, existing.linkedBoardId), oldByBoard.filter((id) => id !== krId));
    const newByBoard = ((await store.get<string[]>(kvIndexKeyResultsByBoard(orgId, next.linkedBoardId))) as string[]) || [];
    if (!newByBoard.includes(krId)) {
      newByBoard.unshift(krId);
      await store.set(kvIndexKeyResultsByBoard(orgId, next.linkedBoardId), newByBoard);
    }
  }

  return next;
}

export async function getObjectivesAndKeyResultsByBoard(params: {
  orgId: string;
  boardId: string;
  quarter?: string | null;
}): Promise<Array<{ objective: OkrsObjective; keyResults: OkrsKeyResult[] }>> {
  const { orgId, boardId, quarter } = params;

  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureOkrsIndexes(db);

    const krFilter: Record<string, unknown> = { orgId, linkedBoardId: boardId };
    const krs = await db.collection<OkrsKeyResult>(COL_KEY_RESULTS).find(krFilter as any).toArray();

    const objectiveIds = Array.from(new Set(krs.map((k) => k.objectiveId)));
    const objFilter: Record<string, unknown> = { orgId, id: { $in: objectiveIds } };
    if (quarter) objFilter.quarter = quarter;

    const objectives = await db.collection<OkrsObjective>(COL_OBJECTIVES).find(objFilter as any).toArray();
    const byObj = new Map<string, OkrsKeyResult[]>();
    for (const kr of krs) {
      const list = byObj.get(kr.objectiveId) ?? [];
      list.push(kr);
      byObj.set(kr.objectiveId, list);
    }
    const grouped = objectives.map((o) => ({
      objective: o,
      keyResults: (byObj.get(o.id) ?? []).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    }));
    grouped.sort((a, b) => new Date(b.objective.updatedAt).getTime() - new Date(a.objective.updatedAt).getTime());
    return grouped;
  }

  const store = await getStore();
  const krIds = ((await store.get<string[]>(kvIndexKeyResultsByBoard(orgId, boardId))) as string[]) || [];
  const krs: OkrsKeyResult[] = [];
  for (const id of krIds) {
    const kr = await store.get<OkrsKeyResult>(kvKeyKeyResult(orgId, id));
    if (!kr) continue;
    if (kr.linkedBoardId !== boardId) continue;
    krs.push(kr);
  }

  const objectiveIds = Array.from(new Set(krs.map((k) => k.objectiveId)));
  const objectives: OkrsObjective[] = [];
  for (const oid of objectiveIds) {
    const o = await store.get<OkrsObjective>(kvKeyObjective(orgId, oid));
    if (!o) continue;
    if (quarter && o.quarter !== quarter) continue;
    objectives.push(o);
  }

  const byObj = new Map<string, OkrsKeyResult[]>();
  for (const kr of krs) {
    const list = byObj.get(kr.objectiveId) ?? [];
    list.push(kr);
    byObj.set(kr.objectiveId, list);
  }

  const grouped = objectives.map((o) => ({
    objective: o,
    keyResults: (byObj.get(o.id) ?? []).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
  }));
  grouped.sort((a, b) => new Date(b.objective.updatedAt).getTime() - new Date(a.objective.updatedAt).getTime());
  return grouped;
}

/** Lista objetivos do quarter (ou todos se quarter vazio) com todos os KRs, para visão org-wide (ex.: Copilot). */
export async function listObjectivesWithKeyResults(
  orgId: string,
  quarter?: string | null
): Promise<Array<{ objective: OkrsObjective; keyResults: OkrsKeyResult[] }>> {
  const objectives = await listObjectives(orgId, quarter);
  if (!objectives.length) return [];

  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureOkrsIndexes(db);
    const objectiveIds = objectives.map((o) => o.id);
    const krs = await db
      .collection<OkrsKeyResult>(COL_KEY_RESULTS)
      .find({ orgId, objectiveId: { $in: objectiveIds } } as any)
      .toArray();
    const byObj = new Map<string, OkrsKeyResult[]>();
    for (const kr of krs) {
      const list = byObj.get(kr.objectiveId) ?? [];
      list.push(kr);
      byObj.set(kr.objectiveId, list);
    }
    return objectives.map((o) => ({
      objective: o,
      keyResults: (byObj.get(o.id) ?? []).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    }));
  }

  const store = await getStore();
  const out: Array<{ objective: OkrsObjective; keyResults: OkrsKeyResult[] }> = [];
  for (const o of objectives) {
    const krIds = ((await store.get<string[]>(kvIndexKeyResultsByObjective(orgId, o.id))) as string[]) || [];
    const krs: OkrsKeyResult[] = [];
    for (const id of krIds) {
      const kr = await store.get<OkrsKeyResult>(kvKeyKeyResult(orgId, id));
      if (kr) krs.push(kr);
    }
    krs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    out.push({ objective: o, keyResults: krs });
  }
  return out;
}

