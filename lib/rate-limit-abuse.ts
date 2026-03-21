import { getDb, isMongoConfigured } from "./mongo";
import type { Db } from "mongodb";

const ABUSE_LOG = "rate_limit_abuse_log";
let abuseIndexes = false;

async function ensureAbuseIndexes(db: Db): Promise<void> {
  if (abuseIndexes) return;
  abuseIndexes = true;
  const col = db.collection(ABUSE_LOG);
  await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await col.createIndex({ at: -1 });
  await col.createIndex({ identifier: 1, at: -1 });
}

export type AbuseLogInput = {
  category: string;
  identifier: string;
  pathname: string;
  ip: string;
  userId?: string;
};

/**
 * Registra bloqueio por rate limit (TTL ~35d para limpeza automática).
 */
export async function logRateLimitAbuse(input: AbuseLogInput): Promise<void> {
  if (!isMongoConfigured()) return;
  const db = await getDb();
  await ensureAbuseIndexes(db);
  const at = new Date();
  const expiresAt = new Date(at.getTime() + 35 * 24 * 60 * 60 * 1000);
  await db.collection(ABUSE_LOG).insertOne({
    at,
    expiresAt,
    category: input.category,
    identifier: input.identifier,
    pathname: input.pathname,
    ip: input.ip,
    userId: input.userId ?? null,
  });
}

export type AbuseAggregateRow = {
  identifier: string;
  category: string;
  hits: number;
  lastAt: string;
  lastPath: string;
  sampleIp: string | null;
  sampleUserId: string | null;
};

/**
 * Top identificadores por volume de bloqueios (últimos `sinceMs`).
 */
export async function aggregateRateLimitAbuse(params: {
  sinceMs: number;
  limit: number;
}): Promise<AbuseAggregateRow[]> {
  if (!isMongoConfigured()) return [];
  const db = await getDb();
  await ensureAbuseIndexes(db);
  const since = new Date(Date.now() - params.sinceMs);
  const col = db.collection(ABUSE_LOG);

  const rows = await col
    .aggregate<{
      _id: { identifier: string; category: string };
      hits: number;
      lastAt: Date;
      lastPath: string;
      sampleIp: string | null;
      sampleUserId: string | null;
    }>([
      { $match: { at: { $gte: since } } },
      { $sort: { at: -1 } },
      {
        $group: {
          _id: { identifier: "$identifier", category: "$category" },
          hits: { $sum: 1 },
          lastAt: { $first: "$at" },
          lastPath: { $first: "$pathname" },
          sampleIp: { $first: "$ip" },
          sampleUserId: { $first: "$userId" },
        },
      },
      { $sort: { hits: -1 } },
      { $limit: params.limit },
    ])
    .toArray();

  return rows.map((r) => ({
    identifier: r._id.identifier,
    category: r._id.category,
    hits: r.hits,
    lastAt: r.lastAt.toISOString(),
    lastPath: r.lastPath,
    sampleIp: r.sampleIp,
    sampleUserId: r.sampleUserId,
  }));
}
