import "server-only";

import { createHash } from "node:crypto";
import { logAiUsage } from "@/lib/ai-usage-log";
import type { LlmRoute } from "@/lib/org-ai-routing";

/** PII-safe fingerprint: length bucket + sha256 prefix only (no raw prompt). */
export function fluxyClassifyPromptFingerprint(text: string): { lenBucket: string; hash8: string } {
  const len = text.trim().length;
  const lenBucket =
    len === 0 ? "0" : len <= 40 ? "1-40" : len <= 120 ? "41-120" : len <= 400 ? "121-400" : "401+";
  const hash8 = createHash("sha256").update(text, "utf8").digest("hex").slice(0, 8);
  return { lenBucket, hash8 };
}

export async function logFluxyClassifyTelemetry(params: {
  orgId: string;
  userId: string;
  tier: "local" | "compat_fast" | "compat_full";
  intentKind: string;
  provider?: LlmRoute;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheHit: boolean;
  userText: string;
}): Promise<void> {
  const fp = fluxyClassifyPromptFingerprint(params.userText);
  const feature = `onda4_omnibar_classify:${params.tier}:${fp.lenBucket}:${fp.hash8}`;
  if (!params.provider || !params.model || params.tier === "local") return;
  await logAiUsage({
    orgId: params.orgId,
    userId: params.userId,
    feature,
    provider: params.provider,
    model: params.model,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    promptFluxVersion: "omnibar_classify_v1",
  });
}
