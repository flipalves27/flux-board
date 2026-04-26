import { randomBytes } from "crypto";
import { getDb, isMongoConfigured } from "@/lib/mongo";
import { getStore } from "@/lib/storage";
import type { ForgeInsightsSnapshot, ForgeJob, ForgePolicy, ForgeRepoChunk, ForgeTier } from "@/lib/forge-types";

const COL_JOBS = "forge_jobs";
const COL_CHUNKS = "forge_repo_chunks";
const COL_POLICIES = "forge_policies";

const KV_JOBS_PREFIX = "forge_jobs:";
const KV_CHUNKS_PREFIX = "forge_chunks:";
const KV_POLICIES_PREFIX = "forge_policies:";
const KV_JOB_INDEX = "forge_job_index:";

function mkId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(5).toString("hex")}`;
}

let indexesEnsured = false;

export async function ensureForgeMongoIndexes(): Promise<void> {
  if (!isMongoConfigured() || indexesEnsured) return;
  const db = await getDb();
  await db.collection(COL_JOBS).createIndex({ orgId: 1, status: 1, createdAt: -1 });
  await db.collection(COL_JOBS).createIndex({ orgId: 1, createdByUserId: 1, createdAt: -1 });
  await db.collection(COL_JOBS).createIndex({ orgId: 1, batchId: 1 });
  await db.collection(COL_CHUNKS).createIndex({ orgId: 1, repoFullName: 1, commitSha: 1 });
  await db.collection(COL_CHUNKS).createIndex({ orgId: 1, path: 1 });
  await db.collection(COL_POLICIES).createIndex({ orgId: 1, repoId: 1 });
  indexesEnsured = true;
}

async function kvJobKey(orgId: string, id: string) {
  return `${KV_JOBS_PREFIX}${orgId}:${id}`;
}

async function kvAppendJobIndex(orgId: string, id: string): Promise<void> {
  const store = await getStore();
  const k = `${KV_JOB_INDEX}${orgId}`;
  const cur = (await store.get<string[]>(k)) ?? [];
  if (!cur.includes(id)) await store.set(k, [id, ...cur].slice(0, 500));
}

export async function insertForgeJob(doc: Omit<ForgeJob, "_id" | "createdAt" | "updatedAt"> & { _id?: string }): Promise<ForgeJob> {
  const now = new Date().toISOString();
  const row: ForgeJob = {
    ...doc,
    _id: doc._id ?? mkId("fjob"),
    timeline: doc.timeline ?? [],
    cardIds: doc.cardIds ?? [],
    createdAt: now,
    updatedAt: now,
  };

  if (!isMongoConfigured()) {
    const store = await getStore();
    await store.set(await kvJobKey(row.orgId, row._id), row);
    await kvAppendJobIndex(row.orgId, row._id);
    return row;
  }

  await ensureForgeMongoIndexes();
  const db = await getDb();
  await db.collection<ForgeJob>(COL_JOBS).insertOne(row);
  return row;
}

export async function getForgeJob(orgId: string, jobId: string): Promise<ForgeJob | null> {
  if (!isMongoConfigured()) {
    const store = await getStore();
    return (await store.get<ForgeJob>(await kvJobKey(orgId, jobId))) ?? null;
  }
  const db = await getDb();
  return (await db.collection<ForgeJob>(COL_JOBS).findOne({ _id: jobId, orgId })) ?? null;
}

export async function updateForgeJob(
  orgId: string,
  jobId: string,
  patch: Partial<Omit<ForgeJob, "_id" | "orgId" | "createdAt">>
): Promise<ForgeJob | null> {
  const now = new Date().toISOString();
  if (!isMongoConfigured()) {
    const store = await getStore();
    const cur = await getForgeJob(orgId, jobId);
    if (!cur) return null;
    const next = { ...cur, ...patch, updatedAt: now };
    await store.set(await kvJobKey(orgId, jobId), next);
    return next;
  }
  const db = await getDb();
  await db.collection<ForgeJob>(COL_JOBS).updateOne({ _id: jobId, orgId }, { $set: { ...patch, updatedAt: now } });
  return getForgeJob(orgId, jobId);
}

export async function listForgeJobs(params: {
  orgId: string;
  status?: string;
  tier?: ForgeTier;
  batchId?: string;
  limit?: number;
}): Promise<ForgeJob[]> {
  const lim = Math.min(Math.max(params.limit ?? 50, 1), 200);
  if (!isMongoConfigured()) {
    const store = await getStore();
    const ids = (await store.get<string[]>(`${KV_JOB_INDEX}${params.orgId}`)) ?? [];
    const out: ForgeJob[] = [];
    for (const id of ids) {
      const j = await store.get<ForgeJob>(await kvJobKey(params.orgId, id));
      if (!j) continue;
      if (params.status && j.status !== params.status) continue;
      if (params.tier && j.tier !== params.tier) continue;
      if (params.batchId && j.batchId !== params.batchId) continue;
      out.push(j);
      if (out.length >= lim) break;
    }
    return out;
  }
  const db = await getDb();
  const filter: Record<string, unknown> = { orgId: params.orgId };
  if (params.status) filter.status = params.status;
  if (params.tier) filter.tier = params.tier;
  if (params.batchId) filter.batchId = params.batchId;
  return db.collection<ForgeJob>(COL_JOBS).find(filter).sort({ createdAt: -1 }).limit(lim).toArray();
}

export async function listActiveForgeJobsForOrg(orgId: string): Promise<
  { runId: string; boardId?: string | null; updatedAt: string; status?: string }[]
> {
  const active = ["queued", "indexing", "planning", "plan_review", "generating", "testing"] as const;
  if (!isMongoConfigured()) {
    const all = await listForgeJobs({ orgId, limit: 100 });
    return all
      .filter((j) => active.includes(j.status as (typeof active)[number]))
      .map((j) => ({ runId: j._id, boardId: j.boardId, updatedAt: j.updatedAt, status: j.status }));
  }
  const db = await getDb();
  const rows = await db
    .collection<ForgeJob>(COL_JOBS)
    .find({ orgId, status: { $in: [...active] } })
    .project({ boardId: 1, updatedAt: 1, status: 1 })
    .limit(20)
    .toArray();
  return rows.map((r) => ({
    runId: r._id,
    boardId: r.boardId,
    updatedAt: r.updatedAt,
    status: r.status,
  }));
}

export async function replaceRepoChunks(params: {
  orgId: string;
  repoFullName: string;
  commitSha: string;
  chunks: Omit<ForgeRepoChunk, "_id" | "orgId" | "repoFullName" | "commitSha" | "createdAt">[];
}): Promise<void> {
  const now = new Date().toISOString();
  if (!isMongoConfigured()) {
    const store = await getStore();
    const key = `${KV_CHUNKS_PREFIX}${params.orgId}:${params.repoFullName}:${params.commitSha}`;
    const docs: ForgeRepoChunk[] = params.chunks.map((c) => ({
      ...c,
      _id: mkId("fchk"),
      orgId: params.orgId,
      repoFullName: params.repoFullName,
      commitSha: params.commitSha,
      createdAt: now,
    }));
    await store.set(key, docs);
    return;
  }
  await ensureForgeMongoIndexes();
  const db = await getDb();
  await db.collection(COL_CHUNKS).deleteMany({
    orgId: params.orgId,
    repoFullName: params.repoFullName,
    commitSha: params.commitSha,
  });
  if (params.chunks.length === 0) return;
  await db.collection<ForgeRepoChunk>(COL_CHUNKS).insertMany(
    params.chunks.map((c) => ({
      ...c,
      _id: mkId("fchk"),
      orgId: params.orgId,
      repoFullName: params.repoFullName,
      commitSha: params.commitSha,
      createdAt: now,
    }))
  );
}

export async function searchForgeChunks(params: {
  orgId: string;
  repoFullName: string;
  commitSha?: string;
  query: string;
  limit?: number;
}): Promise<ForgeRepoChunk[]> {
  const lim = Math.min(Math.max(params.limit ?? 12, 1), 40);
  const q = params.query.trim().slice(0, 120);
  if (!isMongoConfigured()) {
    const store = await getStore();
    if (!params.commitSha) return [];
    const key = `${KV_CHUNKS_PREFIX}${params.orgId}:${params.repoFullName}:${params.commitSha}`;
    const all = (await store.get<ForgeRepoChunk[]>(key)) ?? [];
    if (!q) return all.slice(0, lim);
    const low = q.toLowerCase();
    return all.filter((c) => c.content.toLowerCase().includes(low) || c.path.toLowerCase().includes(low)).slice(0, lim);
  }
  const db = await getDb();
  const filter: Record<string, unknown> = {
    orgId: params.orgId,
    repoFullName: params.repoFullName,
  };
  if (params.commitSha) filter.commitSha = params.commitSha;
  if (q) {
    filter.$or = [
      { path: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
      { content: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
    ];
  }
  return db.collection<ForgeRepoChunk>(COL_CHUNKS).find(filter).limit(lim).toArray();
}

export async function getForgePolicy(orgId: string, repoId?: string | null): Promise<ForgePolicy | null> {
  if (!isMongoConfigured()) {
    const store = await getStore();
    const key = `${KV_POLICIES_PREFIX}${orgId}:${repoId ?? "default"}`;
    return (await store.get<ForgePolicy>(key)) ?? null;
  }
  const db = await getDb();
  return (
    (await db.collection<ForgePolicy>(COL_POLICIES).findOne({
      orgId,
      repoId: repoId ?? null,
    })) ?? null
  );
}

export async function upsertForgePolicy(doc: Omit<ForgePolicy, "_id" | "updatedAt"> & { _id?: string }): Promise<ForgePolicy> {
  const now = new Date().toISOString();
  const row: ForgePolicy = {
    ...doc,
    _id: doc._id ?? mkId("fpol"),
    updatedAt: now,
  };
  if (!isMongoConfigured()) {
    const store = await getStore();
    const key = `${KV_POLICIES_PREFIX}${row.orgId}:${row.repoId ?? "default"}`;
    await store.set(key, row);
    return row;
  }
  await ensureForgeMongoIndexes();
  const db = await getDb();
  await db.collection<ForgePolicy>(COL_POLICIES).updateOne(
    { orgId: row.orgId, repoId: row.repoId ?? null },
    { $set: row },
    { upsert: true }
  );
  return row;
}

export async function computeForgeInsights(orgId: string): Promise<ForgeInsightsSnapshot> {
  const jobs = await listForgeJobs({ orgId, limit: 500 });
  const byRepo: ForgeInsightsSnapshot["byRepo"] = {};
  const byDay: ForgeInsightsSnapshot["byDay"] = {};
  let merged = 0;
  let failed = 0;
  let totalUsd = 0;
  let durSum = 0;
  let durN = 0;

  for (const j of jobs) {
    const repo = j.repoFullName ?? "_unknown";
    byRepo[repo] ??= { runs: 0, merged: 0, failed: 0 };
    byRepo[repo].runs += 1;
    if (j.status === "merged") {
      merged += 1;
      byRepo[repo].merged += 1;
    }
    if (j.status === "failed") {
      failed += 1;
      byRepo[repo].failed += 1;
    }
    const day = j.createdAt.slice(0, 10);
    byDay[day] ??= { runs: 0, success: 0 };
    byDay[day].runs += 1;
    if (j.status === "merged" || j.status === "pr_opened") byDay[day].success += 1;
    totalUsd += j.usage?.usd ?? 0;
    const t0 = Date.parse(j.createdAt);
    const t1 = Date.parse(j.updatedAt);
    if (Number.isFinite(t0) && Number.isFinite(t1) && t1 > t0) {
      durSum += (t1 - t0) / 1000;
      durN += 1;
    }
  }

  return {
    totalRuns: jobs.length,
    mergedRuns: merged,
    failedRuns: failed,
    avgDurationSec: durN ? durSum / durN : null,
    totalUsd,
    byRepo,
    byDay,
  };
}

export async function aggregateAllOrgsForgeStats(): Promise<{
  orgCount: number;
  jobCount: number;
  totalUsd: number;
}> {
  if (!isMongoConfigured()) {
    return { orgCount: 0, jobCount: 0, totalUsd: 0 };
  }
  const db = await getDb();
  const orgs = await db.collection<ForgeJob>(COL_JOBS).distinct("orgId");
  const jobCount = await db.collection(COL_JOBS).countDocuments();
  const agg = await db
    .collection<ForgeJob>(COL_JOBS)
    .aggregate<{ s: number }>([
      { $group: { _id: null, s: { $sum: { $ifNull: ["$usage.usd", 0] } } } },
    ])
    .toArray();
  return {
    orgCount: orgs.length,
    jobCount,
    totalUsd: agg[0]?.s ?? 0,
  };
}
