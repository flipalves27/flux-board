import { describe, expect, it } from "vitest";
import { slidingRateLimitConsume } from "./sliding-rate-limit";

describe("slidingRateLimitConsume (in-memory)", () => {
  it("allows up to limit within window", async () => {
    const key = `test:${Date.now()}:${Math.random()}`;
    const limit = 5;
    const windowMs = 60_000;
    for (let i = 0; i < limit; i++) {
      const r = await slidingRateLimitConsume({ key, limit, windowMs });
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(limit - i - 1);
    }
    const blocked = await slidingRateLimitConsume({ key, limit, windowMs });
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });
});
