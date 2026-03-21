import { getDb, isMongoConfigured } from "./mongo";
import type { Db } from "mongodb";

export type SlidingRateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Unix timestamp (seconds) when the window fully rolls (upper bound). */
  resetUnix: number;
  retryAfterSeconds: number;
};

type SlidingParams = {
  key: string;
  limit: number;
  windowMs: number;
};

const BUCKET_COUNT = 12;
const RL_BUCKETS = "rate_limit_buckets";

function bucketSizeMs(windowMs: number): number {
  return Math.max(1000, Math.floor(windowMs / BUCKET_COUNT));
}

const memBuckets = new Map<string, Map<number, number>>();

function pruneMemBuckets(map: Map<number, number>, now: number, windowMs: number) {
  const min = now - windowMs;
  for (const k of map.keys()) {
    if (k < min) map.delete(k);
  }
}

function slidingInMemory({ key, limit, windowMs }: SlidingParams): SlidingRateLimitResult {
  const now = Date.now();
  const bs = bucketSizeMs(windowMs);
  const bucketStart = Math.floor(now / bs) * bs;
  const minBucket = Math.floor((now - windowMs) / bs) * bs;

  let map = memBuckets.get(key);
  if (!map) {
    map = new Map();
    memBuckets.set(key, map);
  }
  pruneMemBuckets(map, now, windowMs);

  let total = 0;
  for (const [b, c] of map) {
    if (b >= minBucket) total += c;
  }

  const resetUnix = Math.ceil((now + windowMs) / 1000);
  const retryAfterSeconds = Math.max(1, Math.ceil(bs / 1000));

  if (total >= limit) {
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetUnix,
      retryAfterSeconds,
    };
  }

  map.set(bucketStart, (map.get(bucketStart) ?? 0) + 1);
  const remaining = Math.max(0, limit - total - 1);
  return {
    allowed: true,
    limit,
    remaining,
    resetUnix,
    retryAfterSeconds: 0,
  };
}

let indexesEnsured = false;

async function ensureSlidingIndexes(db: Db): Promise<void> {
  if (indexesEnsured) return;
  indexesEnsured = true;
  const col = db.collection(RL_BUCKETS);
  await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await col.createIndex({ rlKey: 1, bucketStart: 1 }, { unique: true });
}

async function slidingMongo({ key, limit, windowMs }: SlidingParams): Promise<SlidingRateLimitResult> {
  const now = Date.now();
  const bs = bucketSizeMs(windowMs);
  const bucketStart = Math.floor(now / bs) * bs;
  const minBucket = Math.floor((now - windowMs) / bs) * bs;
  const resetUnix = Math.ceil((now + windowMs) / 1000);
  const retryAfterSeconds = Math.max(1, Math.ceil(bs / 1000));

  const db = await getDb();
  await ensureSlidingIndexes(db);
  const col = db.collection<{ rlKey: string; bucketStart: number; count: number; expiresAt: Date }>(RL_BUCKETS);

  const agg = await col
    .aggregate<{ total: number }>([
      { $match: { rlKey: key, bucketStart: { $gte: minBucket } } },
      { $group: { _id: null, total: { $sum: "$count" } } },
    ])
    .toArray();
  const current = agg[0]?.total ?? 0;

  if (current >= limit) {
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetUnix,
      retryAfterSeconds,
    };
  }

  const expiresAt = new Date(now + windowMs + 120_000);
  await col.updateOne(
    { rlKey: key, bucketStart },
    {
      $inc: { count: 1 },
      $setOnInsert: { rlKey: key, bucketStart, expiresAt },
    },
    { upsert: true }
  );

  const remaining = Math.max(0, limit - current - 1);
  return {
    allowed: true,
    limit,
    remaining,
    resetUnix,
    retryAfterSeconds: 0,
  };
}

/**
 * Sliding-window rate limit via sub-buckets + sum (Mongo) ou in-memory map (sem Mongo ou falha de conexão).
 */
export async function slidingRateLimitConsume(params: SlidingParams): Promise<SlidingRateLimitResult> {
  if (isMongoConfigured()) {
    try {
      return await slidingMongo(params);
    } catch (err) {
      console.warn("[sliding-rate-limit] MongoDB falhou — usando in-memory:", err instanceof Error ? err.message : err);
      return slidingInMemory(params);
    }
  }
  return slidingInMemory(params);
}

export function rateLimitHeadersFromResult(r: SlidingRateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(r.limit),
    "X-RateLimit-Remaining": String(r.remaining),
    "X-RateLimit-Reset": String(r.resetUnix),
  };
}
