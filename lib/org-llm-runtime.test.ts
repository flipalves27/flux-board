import { afterEach, describe, expect, it } from "vitest";
import type { Organization } from "@/lib/kv-organizations";
import { encryptOrgAiSecrets } from "@/lib/org-ai-secrets-crypto";
import { resolveOrgLlmRuntime } from "@/lib/org-llm-runtime";

describe("resolveOrgLlmRuntime", () => {
  const prevKey = process.env.TOGETHER_API_KEY;
  const prevModel = process.env.TOGETHER_MODEL;
  const prevBase = process.env.TOGETHER_BASE_URL;
  const prevMaster = process.env.FLUX_AI_SECRETS_KEY;

  afterEach(() => {
    if (prevKey === undefined) delete process.env.TOGETHER_API_KEY;
    else process.env.TOGETHER_API_KEY = prevKey;
    if (prevModel === undefined) delete process.env.TOGETHER_MODEL;
    else process.env.TOGETHER_MODEL = prevModel;
    if (prevBase === undefined) delete process.env.TOGETHER_BASE_URL;
    else process.env.TOGETHER_BASE_URL = prevBase;
    if (prevMaster === undefined) delete process.env.FLUX_AI_SECRETS_KEY;
    else process.env.FLUX_AI_SECRETS_KEY = prevMaster;
  });

  it("returns null when env and org have no usable credentials", () => {
    delete process.env.TOGETHER_API_KEY;
    delete process.env.TOGETHER_MODEL;
    expect(resolveOrgLlmRuntime(null)).toBeNull();
    expect(
      resolveOrgLlmRuntime({
        _id: "o",
        name: "n",
        slug: "s",
        ownerId: "u",
        plan: "free",
        maxUsers: 1,
        maxBoards: 1,
        createdAt: new Date().toISOString(),
      } satisfies Organization)
    ).toBeNull();
  });

  it("uses server env when org has no BYOK key", () => {
    process.env.TOGETHER_API_KEY = "env-key";
    process.env.TOGETHER_MODEL = "env-model";
    delete process.env.TOGETHER_BASE_URL;
    const rt = resolveOrgLlmRuntime(null);
    expect(rt?.source).toBe("env");
    expect(rt?.apiKey).toBe("env-key");
    expect(rt?.model).toBe("env-model");
    expect(rt?.baseUrl.endsWith("/v1")).toBe(true);
  });

  it("applies org togetherModel over env when there is no BYOK key", () => {
    process.env.TOGETHER_API_KEY = "env-key";
    process.env.TOGETHER_MODEL = "env-model";
    const org: Organization = {
      _id: "o",
      name: "n",
      slug: "s",
      ownerId: "u",
      plan: "pro",
      maxUsers: 10,
      maxBoards: 10,
      createdAt: new Date().toISOString(),
      aiSettings: { togetherModel: "org-override-model" },
    };
    const rt = resolveOrgLlmRuntime(org);
    expect(rt?.source).toBe("env");
    expect(rt?.model).toBe("org-override-model");
  });

  it("prefers org BYOK when encrypted secrets present", () => {
    process.env.FLUX_AI_SECRETS_KEY = "x".repeat(16);
    process.env.TOGETHER_API_KEY = "env-key";
    process.env.TOGETHER_MODEL = "env-model";
    const enc = encryptOrgAiSecrets({ togetherApiKey: "org-key", togetherBaseUrl: "https://custom.example/v1" }, process.env.FLUX_AI_SECRETS_KEY);
    const org: Organization = {
      _id: "o",
      name: "n",
      slug: "s",
      ownerId: "u",
      plan: "pro",
      maxUsers: 10,
      maxBoards: 10,
      createdAt: new Date().toISOString(),
      aiSettings: { togetherModel: "org-model", aiSecretsEnc: enc },
    };
    const rt = resolveOrgLlmRuntime(org);
    expect(rt?.source).toBe("org");
    expect(rt?.apiKey).toBe("org-key");
    expect(rt?.model).toBe("org-model");
    expect(rt?.baseUrl).toContain("custom.example");
  });
});
