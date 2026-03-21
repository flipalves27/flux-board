import { describe, expect, it, beforeEach, afterEach } from "vitest";
import type { Organization } from "@/lib/kv-organizations";
import {
  isAnthropicApiConfigured,
  resolveBatchLlmRoute,
  resolveInteractiveLlmRoute,
} from "@/lib/org-ai-routing";

describe("org-ai-routing", () => {
  const prevAnthropic = process.env.ANTHROPIC_API_KEY;
  const prevTogether = process.env.TOGETHER_API_KEY;
  const prevModel = process.env.TOGETHER_MODEL;

  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.TOGETHER_API_KEY = "t";
    process.env.TOGETHER_MODEL = "m";
  });

  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = prevAnthropic;
    process.env.TOGETHER_API_KEY = prevTogether;
    process.env.TOGETHER_MODEL = prevModel;
  });

  it("resolveInteractive: admin uses anthropic when key exists", () => {
    process.env.ANTHROPIC_API_KEY = "a";
    const org: Organization = {
      _id: "o1",
      name: "O",
      slug: "o",
      ownerId: "x",
      plan: "pro",
      maxUsers: 10,
      maxBoards: 10,
      createdAt: new Date().toISOString(),
    };
    const r = resolveInteractiveLlmRoute(org, { userId: "u1", isAdmin: true });
    expect(r.route).toBe("anthropic");
  });

  it("resolveInteractive: non-admin without delegation uses together", () => {
    process.env.ANTHROPIC_API_KEY = "a";
    const org: Organization = {
      _id: "o1",
      name: "O",
      slug: "o",
      ownerId: "x",
      plan: "pro",
      maxUsers: 10,
      maxBoards: 10,
      createdAt: new Date().toISOString(),
    };
    const r = resolveInteractiveLlmRoute(org, { userId: "u1", isAdmin: false });
    expect(r.route).toBe("together");
  });

  it("resolveInteractive: delegated user uses anthropic", () => {
    process.env.ANTHROPIC_API_KEY = "a";
    const org: Organization = {
      _id: "o1",
      name: "O",
      slug: "o",
      ownerId: "x",
      plan: "pro",
      maxUsers: 10,
      maxBoards: 10,
      createdAt: new Date().toISOString(),
      aiSettings: { claudeUserIds: ["u2"] },
    };
    const r = resolveInteractiveLlmRoute(org, { userId: "u2", isAdmin: false });
    expect(r.route).toBe("anthropic");
  });

  it("resolveBatch: business + anthropic preference uses anthropic when key exists", () => {
    process.env.ANTHROPIC_API_KEY = "a";
    const org: Organization = {
      _id: "o1",
      name: "O",
      slug: "o",
      ownerId: "x",
      plan: "business",
      maxUsers: 10,
      maxBoards: 10,
      createdAt: new Date().toISOString(),
      aiSettings: { batchLlmProvider: "anthropic" },
    };
    const r = resolveBatchLlmRoute(org);
    expect(r.route).toBe("anthropic");
  });

  it("resolveBatch: business without preference uses together", () => {
    process.env.ANTHROPIC_API_KEY = "a";
    const org: Organization = {
      _id: "o1",
      name: "O",
      slug: "o",
      ownerId: "x",
      plan: "business",
      maxUsers: 10,
      maxBoards: 10,
      createdAt: new Date().toISOString(),
    };
    const r = resolveBatchLlmRoute(org);
    expect(r.route).toBe("together");
  });

  it("isAnthropicApiConfigured reflects env", () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(isAnthropicApiConfigured()).toBe(false);
    process.env.ANTHROPIC_API_KEY = "x";
    expect(isAnthropicApiConfigured()).toBe(true);
  });
});
