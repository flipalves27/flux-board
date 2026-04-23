import { assertOrgAiBudget } from "@/lib/ai-org-budget";
import { logAiUsage } from "@/lib/ai-usage-log";
import { getOrganizationById } from "@/lib/kv-organizations";
import { createOpenAiCompatProvider, type LlmChatMessage } from "@/lib/llm-provider";
import { resolveOrgLlmRuntime } from "@/lib/org-llm-runtime";

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
  mode?: FluxAiCallMode;
};

/**
 * Gateway único para chamadas LLM de inovação: orçamento, provedor e telemetria `ai_usage_log`.
 */
export async function callFluxAi(params: CallFluxAiParams): Promise<
  | { ok: true; text: string; provider: "openai_compat"; model: string }
  | { ok: false; error: string }
> {
  const budget = await assertOrgAiBudget(params.orgId);
  if (!budget.ok) return { ok: false, error: budget.message };

  const org = await getOrganizationById(params.orgId);
  const runtime = resolveOrgLlmRuntime(org);
  if (!runtime) {
    return { ok: false, error: "no_api_key" };
  }

  const provider = createOpenAiCompatProvider(runtime);
  const messages: LlmChatMessage[] = [
    { role: "system", content: params.systemPrompt },
    { role: "user", content: params.userPrompt },
  ];

  const result = await provider.chat(messages, undefined, {
    maxTokens: params.maxTokens ?? 1024,
    temperature: params.temperature ?? 0.35,
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
