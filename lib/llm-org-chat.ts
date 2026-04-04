import type { Organization } from "@/lib/kv-organizations";
import { logAiUsage } from "@/lib/ai-usage-log";
import { assertOrgAiBudget } from "@/lib/ai-org-budget";
import { FLUX_LLM_PROMPT_VERSION } from "@/lib/prompt-versions";
import {
  createAnthropicProvider,
  createTogetherProvider,
  type LlmChatMessage,
  type LlmChatOptions,
  type LlmChatResult,
} from "@/lib/llm-provider";
import { resolveBatchLlmRoute, resolveInteractiveLlmRoute, type LlmRoute } from "@/lib/org-ai-routing";

export type OrgLlmChatResult = LlmChatResult & { resolvedRoute: LlmRoute };

function togetherModelDefault(): string {
  return process.env.TOGETHER_MODEL?.trim() || "meta-llama/Llama-3.3-70B-Instruct-Turbo";
}

/**
 * Chat com roteamento (Admin / delegados → Claude; demais → Together) e log de custo por org.
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
  const { org, orgId, feature, messages, options, mode, userId, isAdmin } = params;

  const budget = await assertOrgAiBudget(orgId);
  if (!budget.ok) {
    return { ok: false, error: budget.message, resolvedRoute: "together" };
  }

  let route: LlmRoute;
  let modelForCall: string;

  if (mode === "batch") {
    const r = resolveBatchLlmRoute(org);
    route = r.route;
    modelForCall = r.route === "anthropic" ? r.anthropicModel : togetherModelDefault();
  } else {
    if (!userId) {
      return { ok: false, error: "missing_user", resolvedRoute: "together" };
    }
    const r = resolveInteractiveLlmRoute(org, { userId, isAdmin: Boolean(isAdmin) });
    route = r.route;
    modelForCall = r.route === "anthropic" ? r.anthropicModel : togetherModelDefault();
  }

  const provider = route === "anthropic" ? createAnthropicProvider() : createTogetherProvider();
  const res = await provider.chat(messages, undefined, { ...options, model: modelForCall });

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

  return { ...res, resolvedRoute: route };
}
