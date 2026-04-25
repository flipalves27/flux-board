import type { Db } from "mongodb";
import { getDb, isMongoConfigured } from "./mongo";
import { getStore } from "./storage";
import { sanitizeText } from "./schemas";
import type {
  ReleaseChangelogEntry,
  ReleaseCreateInput,
  ReleaseData,
  ReleaseRisk,
  ReleaseTimelineEvent,
  ReleaseUpdateInput,
} from "./schemas";

export type { ReleaseData } from "./schemas";

const COL_RELEASES = "releases";

function kvKeyRelease(orgId: string, releaseId: string): string {
  return `release:${orgId}:${releaseId}`;
}

function kvIndexByBoard(orgId: string, boardId: string): string {
  return `releases_index:board:${orgId}:${boardId}`;
}

function mkId(): string {
  return `rel_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function sanitizeChangelog(entries: ReleaseChangelogEntry[] | undefined): ReleaseChangelogEntry[] {
  if (!Array.isArray(entries)) return [];
  return entries.slice(0, 200).map((e) => ({
    kind: e.kind,
    title: sanitizeText(e.title ?? "").trim().slice(0, 240),
    cardId: e.cardId ? sanitizeText(e.cardId).trim().slice(0, 200) : null,
    authorId: e.authorId ? sanitizeText(e.authorId).trim().slice(0, 200) : null,
  }));
}

function sanitizeRisks(risks: ReleaseRisk[] | undefined): ReleaseRisk[] {
  if (!Array.isArray(risks)) return [];
  return risks.slice(0, 40).map((r) => ({
    severity: r.severity,
    title: sanitizeText(r.title ?? "").trim().slice(0, 200),
    mitigation: sanitizeText(r.mitigation ?? "").trim().slice(0, 500),
  }));
}

function sanitizeTimeline(events: ReleaseTimelineEvent[] | undefined): ReleaseTimelineEvent[] {
  if (!Array.isArray(events)) return [];
  return events.slice(-120).map((e) => ({
    at: e.at,
    kind: e.kind,
    by: sanitizeText(e.by ?? "").trim().slice(0, 200),
    note: sanitizeText(e.note ?? "").trim().slice(0, 500),
  }));
}

export function normalizeRelease(raw: ReleaseData): ReleaseData {
  return {
    ...raw,
    sprintIds: Array.isArray(raw.sprintIds) ? raw.sprintIds : [],
    cardIds: Array.isArray(raw.cardIds) ? raw.cardIds : [],
    changelog: Array.isArray(raw.changelog) ? raw.changelog : [],
    aiNotes: typeof raw.aiNotes === "string" ? raw.aiNotes : "",
    humanNotes: typeof raw.humanNotes === "string" ? raw.humanNotes : "",
    healthScore: typeof raw.healthScore === "number" ? raw.healthScore : null,
    risks: Array.isArray(raw.risks) ? raw.risks : [],
    timeline: Array.isArray(raw.timeline) ? raw.timeline : [],
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    deploymentRef: raw.deploymentRef ?? "",
    previousReleaseId: raw.previousReleaseId ?? null,
    plannedAt: raw.plannedAt ?? null,
    releasedAt: raw.releasedAt ?? null,
    rolledBackAt: raw.rolledBackAt ?? null,
    rollbackReason: raw.rollbackReason ?? "",
    archivedAt: raw.archivedAt ?? null,
    createdBy: raw.createdBy ?? "",
  };
}

let releaseIndexesEnsured = false;
async function ensureReleaseIndexes(db: Db): Promise<void> {
  if (releaseIndexesEnsured) return;
  await db.collection(COL_RELEASES).createIndex({ orgId: 1, boardId: 1 });
  await db.collection(COL_RELEASES).createIndex({ orgId: 1, status: 1 });
  await db.collection(COL_RELEASES).createIndex({ orgId: 1, boardId: 1, version: 1 }, { unique: true });
  await db.collection(COL_RELEASES).createIndex({ orgId: 1, boardId: 1, archivedAt: 1 });
  releaseIndexesEnsured = true;
}

export async function listReleases(orgId: string, boardId: string): Promise<ReleaseData[]> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureReleaseIndexes(db);
    const docs = await db.collection<ReleaseData>(COL_RELEASES).find({ orgId, boardId } as any).toArray();
    docs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return docs.map(normalizeRelease);
  }
  const store = await getStore();
  const ids = ((await store.get<string[]>(kvIndexByBoard(orgId, boardId))) as string[]) || [];
  const out: ReleaseData[] = [];
  for (const id of ids) {
    const raw = await store.get<ReleaseData>(kvKeyRelease(orgId, id));
    if (raw) out.push(normalizeRelease(raw));
  }
  out.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return out;
}

export async function getRelease(orgId: string, releaseId: string): Promise<ReleaseData | null> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureReleaseIndexes(db);
    const doc = await db.collection<ReleaseData>(COL_RELEASES).findOne({ orgId, id: releaseId } as any);
    return doc ? normalizeRelease(doc) : null;
  }
  const store = await getStore();
  const raw = await store.get<ReleaseData>(kvKeyRelease(orgId, releaseId));
  return raw ? normalizeRelease(raw) : null;
}

export async function createRelease(params: {
  orgId: string;
  boardId: string;
  createdBy?: string;
  input: ReleaseCreateInput;
}): Promise<ReleaseData> {
  const now = new Date().toISOString();
  const id = mkId();
  const input = params.input;
  const release: ReleaseData = {
    id,
    orgId: params.orgId,
    boardId: params.boardId,
    version: sanitizeText(input.version).trim().slice(0, 40),
    name: sanitizeText(input.name).trim().slice(0, 200),
    summary: sanitizeText(input.summary ?? "").trim().slice(0, 1000),
    versionType: input.versionType ?? "minor",
    status: input.status ?? "draft",
    environment: input.environment ?? "production",
    sprintIds: (input.sprintIds ?? []).slice(0, 40),
    cardIds: (input.cardIds ?? []).slice(0, 500),
    changelog: sanitizeChangelog(input.changelog),
    aiNotes: sanitizeText(input.aiNotes ?? "").trim().slice(0, 6000),
    humanNotes: sanitizeText(input.humanNotes ?? "").trim().slice(0, 6000),
    healthScore: null,
    risks: sanitizeRisks(input.risks),
    timeline: [{ at: now, kind: "created", by: params.createdBy ?? "", note: "" }],
    deploymentRef: sanitizeText(input.deploymentRef ?? "").trim().slice(0, 400),
    previousReleaseId: input.previousReleaseId ?? null,
    plannedAt: input.plannedAt ?? null,
    releasedAt: null,
    rolledBackAt: null,
    rollbackReason: "",
    archivedAt: null,
    tags: (input.tags ?? []).map((t) => sanitizeText(t).trim().slice(0, 60)).filter(Boolean).slice(0, 20),
    createdBy: params.createdBy ?? "",
    createdAt: now,
    updatedAt: now,
  };

  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureReleaseIndexes(db);
    await db.collection(COL_RELEASES).insertOne(release as any);
    return release;
  }

  const store = await getStore();
  await store.set(kvKeyRelease(params.orgId, id), release);
  const ids = ((await store.get<string[]>(kvIndexByBoard(params.orgId, params.boardId))) as string[]) || [];
  if (!ids.includes(id)) {
    ids.unshift(id);
    await store.set(kvIndexByBoard(params.orgId, params.boardId), ids);
  }
  return release;
}

export async function updateRelease(
  orgId: string,
  releaseId: string,
  updates: ReleaseUpdateInput,
  options: { actor?: string } = {}
): Promise<ReleaseData | null> {
  const existing = await getRelease(orgId, releaseId);
  if (!existing) return null;

  const now = new Date().toISOString();
  const timeline: ReleaseTimelineEvent[] = [...existing.timeline];

  const next: ReleaseData = {
    ...existing,
    ...(updates.version !== undefined ? { version: sanitizeText(updates.version).trim().slice(0, 40) } : {}),
    ...(updates.name !== undefined ? { name: sanitizeText(updates.name).trim().slice(0, 200) } : {}),
    ...(updates.summary !== undefined ? { summary: sanitizeText(updates.summary).trim().slice(0, 1000) } : {}),
    ...(updates.versionType !== undefined ? { versionType: updates.versionType } : {}),
    ...(updates.environment !== undefined ? { environment: updates.environment } : {}),
    ...(updates.sprintIds !== undefined ? { sprintIds: updates.sprintIds.slice(0, 40) } : {}),
    ...(updates.cardIds !== undefined ? { cardIds: updates.cardIds.slice(0, 500) } : {}),
    ...(updates.changelog !== undefined ? { changelog: sanitizeChangelog(updates.changelog) } : {}),
    ...(updates.aiNotes !== undefined ? { aiNotes: sanitizeText(updates.aiNotes).trim().slice(0, 6000) } : {}),
    ...(updates.humanNotes !== undefined ? { humanNotes: sanitizeText(updates.humanNotes).trim().slice(0, 6000) } : {}),
    ...(updates.healthScore !== undefined ? { healthScore: updates.healthScore } : {}),
    ...(updates.risks !== undefined ? { risks: sanitizeRisks(updates.risks) } : {}),
    ...(updates.deploymentRef !== undefined
      ? { deploymentRef: sanitizeText(updates.deploymentRef).trim().slice(0, 400) }
      : {}),
    ...(updates.previousReleaseId !== undefined ? { previousReleaseId: updates.previousReleaseId } : {}),
    ...(updates.plannedAt !== undefined ? { plannedAt: updates.plannedAt } : {}),
    ...(updates.releasedAt !== undefined ? { releasedAt: updates.releasedAt } : {}),
    ...(updates.rolledBackAt !== undefined ? { rolledBackAt: updates.rolledBackAt } : {}),
    ...(updates.rollbackReason !== undefined
      ? { rollbackReason: sanitizeText(updates.rollbackReason).trim().slice(0, 500) }
      : {}),
    ...(updates.archivedAt !== undefined
      ? { archivedAt: updates.archivedAt === null ? null : String(updates.archivedAt).trim().slice(0, 80) }
      : {}),
    ...(updates.tags !== undefined
      ? {
          tags: updates.tags
            .map((t) => sanitizeText(t).trim().slice(0, 60))
            .filter(Boolean)
            .slice(0, 20),
        }
      : {}),
    updatedAt: now,
  };

  if (updates.status !== undefined && updates.status !== existing.status) {
    next.status = updates.status;
    if (updates.status === "released" && !existing.releasedAt) {
      next.releasedAt = now;
    }
    if (updates.status === "rolled_back" && !existing.rolledBackAt) {
      next.rolledBackAt = now;
    }
    timeline.push({
      at: now,
      kind:
        updates.status === "released"
          ? "released"
          : updates.status === "rolled_back"
            ? "rolled_back"
            : updates.status === "staging"
              ? "staged"
              : updates.status === "in_review"
                ? "review"
                : updates.status === "planned"
                  ? "planned"
                  : "edited",
      by: options.actor ?? "",
      note: "",
    });
  } else if (
    updates.archivedAt !== undefined &&
    updates.archivedAt !== existing.archivedAt
  ) {
    const toArchive = updates.archivedAt != null;
    timeline.push({
      at: now,
      kind: toArchive ? "archived" : "unarchived",
      by: options.actor ?? "",
      note: "",
    });
  } else {
    timeline.push({ at: now, kind: "edited", by: options.actor ?? "", note: "" });
  }
  next.timeline = timeline.slice(-120);

  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureReleaseIndexes(db);
    await db.collection(COL_RELEASES).replaceOne({ orgId, id: releaseId }, next as any);
    return next;
  }

  const store = await getStore();
  await store.set(kvKeyRelease(orgId, releaseId), next);
  return next;
}

export async function deleteRelease(orgId: string, boardId: string, releaseId: string): Promise<boolean> {
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureReleaseIndexes(db);
    const res = await db.collection(COL_RELEASES).deleteOne({ orgId, id: releaseId });
    return res.deletedCount > 0;
  }
  const store = await getStore();
  const existing = await store.get<ReleaseData>(kvKeyRelease(orgId, releaseId));
  if (!existing) return false;
  await store.del(kvKeyRelease(orgId, releaseId));
  const ids = ((await store.get<string[]>(kvIndexByBoard(orgId, boardId))) as string[]) || [];
  await store.set(
    kvIndexByBoard(orgId, boardId),
    ids.filter((x) => x !== releaseId)
  );
  return true;
}

export async function appendReleaseTimeline(
  orgId: string,
  releaseId: string,
  event: Omit<ReleaseTimelineEvent, "at"> & { at?: string }
): Promise<ReleaseData | null> {
  const existing = await getRelease(orgId, releaseId);
  if (!existing) return null;
  const nextEvent: ReleaseTimelineEvent = {
    at: event.at ?? new Date().toISOString(),
    kind: event.kind,
    by: sanitizeText(event.by ?? "").trim().slice(0, 200),
    note: sanitizeText(event.note ?? "").trim().slice(0, 500),
  };
  const timeline = sanitizeTimeline([...existing.timeline, nextEvent]);
  const next: ReleaseData = { ...existing, timeline, updatedAt: new Date().toISOString() };
  if (isMongoConfigured()) {
    const db = await getDb();
    await ensureReleaseIndexes(db);
    await db.collection(COL_RELEASES).replaceOne({ orgId, id: releaseId }, next as any);
    return next;
  }
  const store = await getStore();
  await store.set(kvKeyRelease(orgId, releaseId), next);
  return next;
}
