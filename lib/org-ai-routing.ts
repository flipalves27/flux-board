import type { Organization } from "@/lib/kv-organizations";
import type { PlanGateContext } from "@/lib/plan-gates";
import { isTogetherApiConfigured, resolveOrgLlmRuntime } from "@/lib/org-llm-runtime";
import { resolveAnthropicForgeConfig } from "@/lib/llm-anthropic-provider";

/** Valor canónico em telemetria / `ai_usage_log`. */
export type LlmRoute = "openai_compat" | "anthropic";

export { isTogetherApiConfigured, resolveOrgLlmRuntime, isOrgCloudLlmConfigured } from "@/lib/org-llm-runtime";

/** @deprecated Use {@link isOrgCloudLlmConfigured} com a org quando disponível. */
export function isCloudLlmConfigured(): boolean {
  return isTogetherApiConfigured();
}

/**
 * Copilot, insights, etc.: motor único OpenAI-compat (BYOK ou env do servidor).
 * Parâmetros de utilizador mantidos por compatibilidade de assinatura; não alteram a rota.
 */
export function resolveInteractiveLlmRoute(
  org: Organization | null | undefined,
  _params: { userId: string; isAdmin: boolean }
): { route: LlmRoute; model: string } {
  const rt = resolveOrgLlmRuntime(org);
  return { route: "openai_compat", model: rt?.model ?? "" };
}

/** Digest / jobs sem utilizador: mesmo motor que o interativo. */
export function resolveBatchLlmRoute(
  org: Organization | null | undefined,
  _ctx?: PlanGateContext
): { route: LlmRoute; model: string } {
  const rt = resolveOrgLlmRuntime(org);
  return { route: "openai_compat", model: rt?.model ?? "" };
}

export function isAnthropicApiConfigured(): boolean {
  return resolveAnthropicForgeConfig() != null;
}
