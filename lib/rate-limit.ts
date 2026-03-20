import { getDb, isMongoConfigured } from "./mongo";
import type { Db } from "mongodb";

type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

type RateLimitParams = {
  /**
   * Identificador do limit (inclui rota + escopo).
   * Ex.: `boards:daily-insights:user:${userId}`
   */
  key: string;
  limit: number;
  windowMs: number;
};

function normalizeIp(ip: string): string {
  // Remove porta e espaços extras
  const s = String(ip || "").trim();
  if (!s) return "unknown";
  // Formato comum: "x.x.x.x" ou "x.x.x.x:port"
  return s.split(",")[0].split(":")[0] || "unknown";
}

export function getClientIpFromHeaders(headers: { get(name: string): string | null | undefined }): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return normalizeIp(xff);

  const cf = headers.get("cf-connecting-ip");
  if (cf) return normalizeIp(cf);

  const xr = headers.get("x-real-ip");
  if (xr) return normalizeIp(xr);

  return "unknown";
}

const memoryCounters = new Map<
  string,
  { windowStartMs: number; count: number }
>();

function rateLimitInMemory({ key, limit, windowMs }: RateLimitParams): RateLimitResult {
  const now = Date.now();
  const windowStartMs = Math.floor(now / windowMs) * windowMs;

  const prev = memoryCounters.get(key);
  const next =
    !prev || prev.windowStartMs !== windowStartMs
      ? { windowStartMs, count: 1 }
      : { windowStartMs, count: prev.count + 1 };

  memoryCounters.set(key, next);

  const retryAfterMs = windowStartMs + windowMs - now;
  const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return {
    allowed: next.count <= limit,
    retryAfterSeconds,
  };
}

const RL_COLLECTION = "rate_limits";
let indexesEnsured = false;

async function ensureRateLimitIndexes(db: Db): Promise<void> {
  if (indexesEnsured) return;
  indexesEnsured = true;

  const col = db.collection(RL_COLLECTION);
  // TTL remove automaticamente docs por janela. +60s para reduzir risco de corrida.
  await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await col.createIndex({ key: 1, windowStartMs: 1 }, { unique: true });
}

async function rateLimitMongo({ key, limit, windowMs }: RateLimitParams): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStartMs = Math.floor(now / windowMs) * windowMs;
  const expiresAt = new Date(windowStartMs + windowMs + 60_000);

  const db = await getDb();
  await ensureRateLimitIndexes(db);

  const col = db.collection<{ key: string; windowStartMs: number; count: number; expiresAt: Date }>(RL_COLLECTION);
  const r = await col.findOneAndUpdate(
    { key, windowStartMs },
    {
      $inc: { count: 1 },
      $setOnInsert: { key, windowStartMs, count: 0, expiresAt },
    },
    { upsert: true, returnDocument: "after" }
  );

  const doc = r.value;
  const count = typeof doc?.count === "number" ? doc.count : 1;

  const retryAfterMs = windowStartMs + windowMs - now;
  const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return {
    allowed: count <= limit,
    retryAfterSeconds,
  };
}

/**
 * Rate limit em janela fixa.
 * - Usa Mongo quando `MONGODB_URI` existe.
 * - Caso contrário, usa Map in-memory (dev/local).
 */
export async function rateLimit({ key, limit, windowMs }: RateLimitParams): Promise<RateLimitResult> {
  if (isMongoConfigured()) {
    return rateLimitMongo({ key, limit, windowMs });
  }
  return rateLimitInMemory({ key, limit, windowMs });
}

