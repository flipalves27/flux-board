import type { Organization } from "@/lib/kv-organizations";
import { decryptOrgAiSecrets, getOrgAiSecretsMasterKey } from "@/lib/org-ai-secrets-crypto";

export type OrgOpenAiCompatRuntime = {
  apiKey: string;
  model: string;
  baseUrl: string;
  /** Where credentials came from (BYOK vs server env). */
  source: "org" | "env";
};

function normalizeBaseUrl(url: string): string {
  const u = url.replace(/\/+$/, "");
  if (/\/v1$/i.test(u)) return u;
  return `${u}/v1`.replace(/\/v1\/v1$/i, "/v1");
}

function envRuntime(): OrgOpenAiCompatRuntime | null {
  const apiKey = process.env.TOGETHER_API_KEY?.trim();
  const model = process.env.TOGETHER_MODEL?.trim();
  if (!apiKey || !model) return null;
  const base = (process.env.TOGETHER_BASE_URL || "https://api.together.xyz/v1").replace(/\/+$/, "");
  return {
    apiKey,
    model,
    baseUrl: normalizeBaseUrl(base),
    source: "env",
  };
}

function readOrgSecrets(org: Organization | null | undefined) {
  const enc = org?.aiSettings?.aiSecretsEnc;
  if (!enc || typeof enc !== "string") return null;
  const master = getOrgAiSecretsMasterKey();
  if (!master) return null;
  return decryptOrgAiSecrets(enc, master);
}

/**
 * Effective OpenAI-compatible chat + embeddings credentials for an org.
 * BYOK wins when org has a decrypted API key; otherwise server `TOGETHER_*` env.
 */
export function resolveOrgLlmRuntime(org: Organization | null | undefined): OrgOpenAiCompatRuntime | null {
  const secrets = readOrgSecrets(org);
  const orgKey = secrets?.togetherApiKey?.trim();
  const orgBase = secrets?.togetherBaseUrl?.trim();
  const orgModelRaw = org?.aiSettings?.togetherModel?.trim();
  const env = envRuntime();

  if (orgKey) {
    const model = orgModelRaw || env?.model || "";
    if (!model) return env ?? null;
    const baseRaw = orgBase || process.env.TOGETHER_BASE_URL || "https://api.together.xyz/v1";
    return {
      apiKey: orgKey,
      model,
      baseUrl: normalizeBaseUrl(baseRaw.replace(/\/+$/, "")),
      source: "org",
    };
  }

  if (env && orgModelRaw) {
    return { ...env, model: orgModelRaw };
  }

  return env;
}

export function isTogetherApiConfigured(): boolean {
  return envRuntime() != null;
}

export function isOrgCloudLlmConfigured(org: Organization | null | undefined): boolean {
  return resolveOrgLlmRuntime(org) != null;
}
