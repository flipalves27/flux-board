import { describe, expect, it, vi } from "vitest";
import { enforcePublicApiRateLimit } from "./public-api-rate-limit";

const slidingRateLimitConsume = vi.fn();

vi.mock("./sliding-rate-limit", () => ({
  slidingRateLimitConsume: (...args: unknown[]) => slidingRateLimitConsume(...args),
}));

describe("enforcePublicApiRateLimit", () => {
  it("returns null when request is allowed", async () => {
    slidingRateLimitConsume.mockResolvedValue({
      allowed: true,
      limit: 10,
      remaining: 9,
      resetUnix: 0,
      retryAfterSeconds: 0,
    });
    const req = new Request("http://localhost/api/public/v1/cards", {
      method: "GET",
      headers: { "x-api-key": "k_test_123" },
    });
    const denied = await enforcePublicApiRateLimit(req, {
      ok: true,
      orgId: "org_1",
      scopes: ["cards:read"],
    });
    expect(denied).toBeNull();
  });

  it("returns 429 when request is denied", async () => {
    slidingRateLimitConsume.mockResolvedValue({
      allowed: false,
      limit: 10,
      remaining: 0,
      resetUnix: 0,
      retryAfterSeconds: 3,
    });
    const req = new Request("http://localhost/api/public/v1/cards", {
      method: "POST",
      headers: { "x-api-key": "k_test_123" },
    });
    const denied = await enforcePublicApiRateLimit(req, {
      ok: true,
      orgId: "org_1",
      scopes: ["cards:write"],
    });
    expect(denied?.status).toBe(429);
  });
});

