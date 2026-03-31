import { afterEach, describe, expect, it, vi } from "vitest";
import { assertPublicApiKey, assertPublicApiScope } from "./public-api-auth";

describe("assertPublicApiKey", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns ok with valid key", async () => {
    vi.stubEnv("PUBLIC_API_V1_KEY", "k_test");
    vi.stubEnv("PUBLIC_API_V1_ORG_ID", "org_1");
    const req = new Request("http://localhost/api/public/v1/boards", {
      headers: { "x-api-key": "k_test" },
    });
    const result = await assertPublicApiKey(req);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.orgId).toBe("org_1");
      expect(result.scopes).toContain("boards:read");
    }
  });

  it("returns 401 with invalid key", async () => {
    vi.stubEnv("PUBLIC_API_V1_KEY", "k_test");
    vi.stubEnv("PUBLIC_API_V1_ORG_ID", "org_1");
    const req = new Request("http://localhost/api/public/v1/boards", {
      headers: { "x-api-key": "wrong" },
    });
    const result = await assertPublicApiKey(req);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("supports multi-token JSON and scope checks", async () => {
    vi.stubEnv(
      "PUBLIC_API_V1_TOKENS_JSON",
      JSON.stringify([
        { key: "k_one", orgId: "org_1", scopes: ["boards:read"] },
        { key: "k_two", orgId: "org_2", scopes: ["cards:read", "sprints:read"] },
      ])
    );
    const req = new Request("http://localhost/api/public/v1/cards", {
      headers: { "x-api-key": "k_two" },
    });
    const result = await assertPublicApiKey(req);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.orgId).toBe("org_2");
      const denied = assertPublicApiScope(result, "boards:read");
      expect(denied?.ok).toBe(false);
      expect(assertPublicApiScope(result, "cards:read")).toBeNull();
    }
  });
});

