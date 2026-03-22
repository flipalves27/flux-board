import { getDb, isMongoConfigured } from "@/lib/mongo";

const COL = "ai_usage_log";

function dailyCapUsd(): number | null {
  const raw = process.env.AI_ORG_DAILY_USD_CAP?.trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function startOfUtcDayIso(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0)).toISOString();
}

/**
 * Soma custo estimado (USD) das chamadas LLM da org desde o início do dia UTC.
 */
export async function getOrgAiSpendTodayUtc(orgId: string): Promise<number> {
  if (!isMongoConfigured()) return 0;
  const db = await getDb();
  const since = startOfUtcDayIso();
  const rows = await db
    .collection(COL)
    .aggregate<{ total: number }>([
      { $match: { orgId, createdAt: { $gte: since } } },
      { $group: { _id: null, total: { $sum: { $ifNull: ["$estimatedCostUsd", 0] } } } },
    ])
    .toArray();
  const t = rows[0]?.total;
  return typeof t === "number" && Number.isFinite(t) ? t : 0;
}

export async function assertOrgAiBudget(orgId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const cap = dailyCapUsd();
  if (cap === null) return { ok: true };
  if (cap === 0) {
    return { ok: false, message: "Cota diária de IA da organização esgotada (cap=0)." };
  }
  const spent = await getOrgAiSpendTodayUtc(orgId);
  if (spent >= cap) {
    return {
      ok: false,
      message: `Cota diária de IA excedida (≈ $${spent.toFixed(2)} / $${cap.toFixed(2)} USD).`,
    };
  }
  return { ok: true };
}
