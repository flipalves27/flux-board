import { getDb, isMongoConfigured } from "./mongo";
import type { Db } from "mongodb";

export { getClientIpFromHeaders } from "./client-ip";

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
      // Não definimos `count` em `$setOnInsert` para evitar conflito com `$inc` no mesmo campo
      // durante o `upsert` (Mongo: ConflictUpdatingOperators).
      $setOnInsert: { key, windowStartMs, expiresAt },
    },
    { upsert: true, returnDocument: "after" }
  );

  // `findOneAndUpdate` (mongodb v4+) typically returns `{ value: Document | null, ... }`.
  // Como os types podem variar, tratamos tanto `r.value` quanto `r` como fallback.
  const doc = (r as any)?.value ?? (r as any);
  const count = typeof (doc as any)?.count === "number" ? (doc as any).count : 1;

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

/**
 * Limite só em memória (por instância serverless). Use em rotas muito frequentes onde um round-trip
 * extra ao Mongo para rate limit competiria com a latência crítica (ex.: `GET /api/auth/session`).
 */
export async function rateLimitMemoryOnly(params: RateLimitParams): Promise<RateLimitResult> {
  return rateLimitInMemory(params);
}

