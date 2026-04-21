import { assertOrgAiBudget } from "@/lib/ai-org-budget";
import { logAiUsage } from "@/lib/ai-usage-log";
import { getOrganizationById } from "@/lib/kv-organizations";
import { createAnthropicProvider, createTogetherProvider, type LlmChatMessage } from "@/lib/llm-provider";
import { resolveBatchLlmRoute, resolveInteractiveLlmRoute } from "@/lib/org-ai-routing";
import type { PlanGateContext } from "@/lib/plan-gates";

export type FluxAiCallMode = "interactive" | "batch";

export type CallFluxAiParams = {
  feature: string;
  orgId: string;
  userId?: string | null;
  isAdmin?: boolean;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  /** interactive: roteamento por usuário admin/claudeUserIds; batch: org + tier Business. */
  mode?: FluxAiCallMode;
  planGateCtx?: PlanGateContext;
};

/**
 * Gateway único para chamadas LLM de inovação: orçamento, provedor e telemetria `ai_usage_log`.
 */
export async function callFluxAi(params: CallFluxAiParams): Promise<
  | { ok: true; text: string; provider: "anthropic" | "together"; model: string }
  | { ok: false; error: string }
> {
  const budget = await assertOrgAiBudget(params.orgId);
  if (!budget.ok) return { ok: false, error: budget.message };

  const org = await getOrganizationById(params.orgId);
  const mode = params.mode ?? "batch";
  const { route, anthropicModel } =
    mode === "interactive" && params.userId
      ? resolveInteractiveLlmRoute(org, { userId: params.userId, isAdmin: Boolean(params.isAdmin) })
      : resolveBatchLlmRoute(org, params.planGateCtx);

  const provider = route === "anthropic" ? createAnthropicProvider() : createTogetherProvider();
  const messages: LlmChatMessage[] = [
    { role: "system", content: params.systemPrompt },
    { role: "user", content: params.userPrompt },
  ];

  const result = await provider.chat(messages, undefined, {
    maxTokens: params.maxTokens ?? 1024,
    temperature: params.temperature ?? 0.35,
    ...(route === "anthropic" ? { model: anthropicModel } : {}),
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  void logAiUsage({
    orgId: params.orgId,
    userId: params.userId ?? null,
    feature: params.feature.slice(0, 120),
    provider: result.provider,
    model: result.model,
    inputTokens: result.usage?.inputTokens,
    outputTokens: result.usage?.outputTokens,
  });

  return { ok: true, text: result.assistantText, provider: result.provider, model: result.model };
}
