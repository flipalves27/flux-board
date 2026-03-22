import type { Organization, OrgAiSettings } from "@/lib/kv-organizations";
import type { PlanGateContext } from "@/lib/plan-gates";
import { getEffectiveTier } from "@/lib/plan-gates";

export type LlmRoute = "anthropic" | "together";

export function isAnthropicApiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

export function isTogetherApiConfigured(): boolean {
  return Boolean(process.env.TOGETHER_API_KEY?.trim() && process.env.TOGETHER_MODEL?.trim());
}

/** Qualquer LLM cloud configurado (Claude ou Together). */
export function isCloudLlmConfigured(): boolean {
  return isAnthropicApiConfigured() || isTogetherApiConfigured();
}

function anthropicModelForOrg(org: Organization | null | undefined): string {
  const s: OrgAiSettings | undefined = org?.aiSettings;
  const fromOrg = typeof s?.anthropicModel === "string" ? s.anthropicModel.trim() : "";
  const fromEnv = process.env.ANTHROPIC_MODEL?.trim();
  return fromOrg || fromEnv || "claude-3-5-sonnet-20241022";
}

/**
 * Copilot, daily insights, etc.: só Admin ou usuários em `claudeUserIds` usam Claude.
 * Demais usuários: Together (se configurado).
 */
export function resolveInteractiveLlmRoute(
  org: Organization | null | undefined,
  params: { userId: string; isAdmin: boolean }
): { route: LlmRoute; anthropicModel: string } {
  const anthropicModel = anthropicModelForOrg(org);
  if (!isAnthropicApiConfigured()) {
    return { route: "together", anthropicModel };
  }
  if (params.isAdmin) {
    return { route: "anthropic", anthropicModel };
  }
  const allowed = org?.aiSettings?.claudeUserIds ?? [];
  if (allowed.includes(params.userId)) {
    return { route: "anthropic", anthropicModel };
  }
  return { route: "together", anthropicModel };
}

/**
 * Weekly digest / OKR blocos sem usuário: Business pode preferir Claude em lote.
 */
export function resolveBatchLlmRoute(
  org: Organization | null | undefined,
  ctx?: PlanGateContext
): { route: LlmRoute; anthropicModel: string } {
  const anthropicModel = anthropicModelForOrg(org);
  if (!isAnthropicApiConfigured()) {
    return { route: "together", anthropicModel };
  }
  const tier = getEffectiveTier(org, ctx);
  if ((tier === "business" || tier === "enterprise") && org?.aiSettings?.batchLlmProvider === "anthropic") {
    return { route: "anthropic", anthropicModel };
  }
  return { route: "together", anthropicModel };
}
