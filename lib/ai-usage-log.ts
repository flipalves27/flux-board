import { getDb, isMongoConfigured } from "@/lib/mongo";
import type { LlmRoute } from "@/lib/org-ai-routing";

const COL = "ai_usage_log";

let indexesEnsured = false;

async function ensureIndexes(): Promise<void> {
  if (!isMongoConfigured() || indexesEnsured) return;
  const db = await getDb();
  await db.collection(COL).createIndex({ orgId: 1, createdAt: -1 });
  await db.collection(COL).createIndex({ createdAt: -1 });
  indexesEnsured = true;
}

/** USD por 1M tokens — ajustável via env (estimativa de custo). */
function pricePerMillion(provider: LlmRoute, kind: "input" | "output"): number {
  if (provider === "anthropic") {
    const envKey = kind === "input" ? "AI_PRICE_ANTHROPIC_INPUT_PER_M" : "AI_PRICE_ANTHROPIC_OUTPUT_PER_M";
    const raw = Number(process.env[envKey] ?? "");
    if (Number.isFinite(raw) && raw >= 0) return raw;
    return kind === "input" ? 3 : 15;
  }
  const envKey = kind === "input" ? "AI_PRICE_TOGETHER_INPUT_PER_M" : "AI_PRICE_TOGETHER_OUTPUT_PER_M";
  const raw = Number(process.env[envKey] ?? "");
  if (Number.isFinite(raw) && raw >= 0) return raw;
  return kind === "input" ? 0.88 : 0.88;
}

export function estimateLlmCostUsd(params: {
  provider: LlmRoute;
  inputTokens: number;
  outputTokens: number;
}): number {
  const inCost = (params.inputTokens / 1_000_000) * pricePerMillion(params.provider, "input");
  const outCost = (params.outputTokens / 1_000_000) * pricePerMillion(params.provider, "output");
  return Math.round((inCost + outCost) * 1_000_000) / 1_000_000;
}

export type AiUsageLogInput = {
  orgId: string;
  userId?: string | null;
  feature: string;
  provider: LlmRoute;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
};

export async function logAiUsage(entry: AiUsageLogInput): Promise<void> {
  if (!isMongoConfigured()) return;
  try {
    await ensureIndexes();
    const db = await getDb();
    const inputTokens = entry.inputTokens ?? 0;
    const outputTokens = entry.outputTokens ?? 0;
    const estimatedCostUsd =
      inputTokens > 0 || outputTokens > 0
        ? estimateLlmCostUsd({
            provider: entry.provider,
            inputTokens,
            outputTokens,
          })
        : undefined;

    await db.collection(COL).insertOne({
      orgId: entry.orgId,
      userId: entry.userId ?? null,
      feature: entry.feature.slice(0, 120),
      provider: entry.provider,
      model: entry.model.slice(0, 160),
      inputTokens,
      outputTokens,
      estimatedCostUsd,
      createdAt: new Date().toISOString(),
    });
  } catch (e) {
    console.warn("[ai_usage_log]", e instanceof Error ? e.message : e);
  }
}
