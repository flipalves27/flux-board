import type { Organization } from "@/lib/kv-organizations";
import { logAiUsage } from "@/lib/ai-usage-log";
import { assertOrgAiBudget } from "@/lib/ai-org-budget";
import { FLUX_LLM_PROMPT_VERSION } from "@/lib/prompt-versions";
import { createOpenAiCompatProvider, type LlmChatMessage, type LlmChatOptions, type LlmChatResult } from "@/lib/llm-provider";
import { resolveOrgLlmRuntime } from "@/lib/org-llm-runtime";
import type { LlmRoute } from "@/lib/org-ai-routing";

export type OrgLlmChatResult = LlmChatResult & { resolvedRoute: LlmRoute };

/**
 * Chat com motor OpenAI-compat (BYOK da org ou variáveis do servidor) e log de custo por org.
 */
export async function runOrgLlmChat(params: {
  org: Organization | null | undefined;
  orgId: string;
  feature: string;
  messages: LlmChatMessage[];
  options?: LlmChatOptions;
  mode: "interactive" | "batch";
  userId?: string;
  isAdmin?: boolean;
}): Promise<OrgLlmChatResult> {
  const { org, orgId, feature, messages, options, mode, userId } = params;

  const budget = await assertOrgAiBudget(orgId);
  if (!budget.ok) {
    return { ok: false, error: budget.message, resolvedRoute: "openai_compat" };
  }

  const runtime = resolveOrgLlmRuntime(org);
  if (!runtime) {
    return { ok: false, error: "no_api_key", resolvedRoute: "openai_compat" };
  }

  if (mode === "interactive" && !userId) {
    return { ok: false, error: "missing_user", resolvedRoute: "openai_compat" };
  }

  const provider = createOpenAiCompatProvider(runtime);
  const res = await provider.chat(messages, undefined, options);

  if (res.ok) {
    await logAiUsage({
      orgId,
      userId: mode === "interactive" ? userId ?? null : null,
      feature,
      provider: res.provider,
      model: res.model,
      inputTokens: res.usage?.inputTokens,
      outputTokens: res.usage?.outputTokens,
      promptFluxVersion: FLUX_LLM_PROMPT_VERSION,
    });
  }

  return { ...res, resolvedRoute: "openai_compat" };
}
