import { describe, expect, it, beforeEach, afterEach } from "vitest";
import type { Organization } from "@/lib/kv-organizations";
import {
  isAnthropicApiConfigured,
  isCloudLlmConfigured,
  resolveBatchLlmRoute,
  resolveInteractiveLlmRoute,
} from "@/lib/org-ai-routing";

function baseOrg(overrides: Partial<Organization> = {}): Organization {
  return {
    _id: "o1",
    name: "O",
    slug: "o",
    ownerId: "x",
    plan: "pro",
    maxUsers: 10,
    maxBoards: 10,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("org-ai-routing", () => {
  const prevKey = process.env.TOGETHER_API_KEY;
  const prevModel = process.env.TOGETHER_MODEL;
  const prevBase = process.env.TOGETHER_BASE_URL;

  beforeEach(() => {
    delete process.env.TOGETHER_API_KEY;
    delete process.env.TOGETHER_MODEL;
    delete process.env.TOGETHER_BASE_URL;
  });

  afterEach(() => {
    if (prevKey === undefined) delete process.env.TOGETHER_API_KEY;
    else process.env.TOGETHER_API_KEY = prevKey;
    if (prevModel === undefined) delete process.env.TOGETHER_MODEL;
    else process.env.TOGETHER_MODEL = prevModel;
    if (prevBase === undefined) delete process.env.TOGETHER_BASE_URL;
    else process.env.TOGETHER_BASE_URL = prevBase;
  });

  it("resolveInteractiveLlmRoute always returns openai_compat and env model when configured", () => {
    process.env.TOGETHER_API_KEY = "k";
    process.env.TOGETHER_MODEL = "m-env";
    const r = resolveInteractiveLlmRoute(baseOrg(), { userId: "u1", isAdmin: false });
    expect(r.route).toBe("openai_compat");
    expect(r.model).toBe("m-env");
  });

  it("resolveInteractiveLlmRoute uses org model with env fallback when no BYOK key", () => {
    process.env.TOGETHER_API_KEY = "k";
    process.env.TOGETHER_MODEL = "m-env";
    const r = resolveInteractiveLlmRoute(baseOrg({ aiSettings: { togetherModel: "m-org" } }), {
      userId: "u1",
      isAdmin: true,
    });
    expect(r.route).toBe("openai_compat");
    expect(r.model).toBe("m-org");
  });

  it("resolveBatchLlmRoute matches interactive route for same org", () => {
    process.env.TOGETHER_API_KEY = "k";
    process.env.TOGETHER_MODEL = "m-env";
    const org = baseOrg();
    expect(resolveBatchLlmRoute(org)).toEqual(resolveInteractiveLlmRoute(org, { userId: "u", isAdmin: false }));
  });

  it("resolveBatchLlmRoute returns empty model when LLM not configured", () => {
    const r = resolveBatchLlmRoute(baseOrg());
    expect(r.route).toBe("openai_compat");
    expect(r.model).toBe("");
  });

  it("isAnthropicApiConfigured is always false", () => {
    expect(isAnthropicApiConfigured()).toBe(false);
  });

  it("isCloudLlmConfigured reflects server env only", () => {
    expect(isCloudLlmConfigured()).toBe(false);
    process.env.TOGETHER_API_KEY = "x";
    process.env.TOGETHER_MODEL = "y";
    expect(isCloudLlmConfigured()).toBe(true);
  });
});
