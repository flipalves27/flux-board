/**
 * Cliente REST Upstash opcional (sem dependência npm).
 * Quando env ausente, operações retornam null / no-op — Mongo continua fonte de verdade.
 */

async function upstashFetch(args: [string, ...string[]]): Promise<unknown | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const res = await fetch(`${url}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

/** SET key value EX seconds — retorna OK se gravou. */
export async function redisSetEx(key: string, value: string, ttlSec: number): Promise<boolean> {
  const data = await upstashFetch(["SET", key, value, "EX", String(Math.max(1, ttlSec))]);
  return data !== null;
}

/** GET key */
export async function redisGet(key: string): Promise<string | null> {
  const data = (await upstashFetch(["GET", key])) as { result?: string | null } | null;
  if (!data || data.result == null) return null;
  return String(data.result);
}

export function isUpstashRedisConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL?.trim() && process.env.UPSTASH_REDIS_REST_TOKEN?.trim());
}
