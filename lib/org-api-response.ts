import type { Organization, OrgAiSettings } from "@/lib/kv-organizations";
import { isTogetherApiConfigured, resolveOrgLlmRuntime } from "@/lib/org-llm-runtime";

export type PublicOrgAiSettings = {
  togetherModel?: string | null;
  hasOrgApiKey: boolean;
};

export type OrgLlmPublicSummary = {
  llmConfigured: boolean;
  effectiveModel: string | null;
  hasOrgApiKey: boolean;
  usesOrgCredentials: boolean;
  serverFallbackConfigured: boolean;
};

function publicAiSettings(ai: OrgAiSettings | null | undefined): PublicOrgAiSettings | null {
  if (!ai) return null;
  return {
    togetherModel: ai.togetherModel ?? null,
    hasOrgApiKey: Boolean(ai.aiSecretsEnc?.trim()),
  };
}

export function orgLlmSummary(org: Organization): OrgLlmPublicSummary {
  const rt = resolveOrgLlmRuntime(org);
  const ai = org.aiSettings;
  return {
    llmConfigured: Boolean(rt),
    effectiveModel: rt?.model ?? null,
    hasOrgApiKey: Boolean(ai?.aiSecretsEnc?.trim()),
    usesOrgCredentials: rt?.source === "org",
    serverFallbackConfigured: isTogetherApiConfigured(),
  };
}

/**
 * Organização como exposta à API (sem segredos de IA).
 */
export function organizationForApiClient(org: Organization): Omit<Organization, "aiSettings"> & {
  aiSettings: PublicOrgAiSettings | null;
  llm: OrgLlmPublicSummary;
} {
  const { aiSettings: _raw, ...rest } = org;
  return {
    ...rest,
    aiSettings: publicAiSettings(org.aiSettings),
    llm: orgLlmSummary(org),
  };
}
