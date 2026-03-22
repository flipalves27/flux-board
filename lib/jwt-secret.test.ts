import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

describe("jwt-secret", () => {
  const prevJwt = process.env.JWT_SECRET;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (prevJwt === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = prevJwt;
  });

  it("getJwtSecret throws when unset", async () => {
    delete process.env.JWT_SECRET;
    const { getJwtSecret } = await import("./jwt-secret");
    expect(() => getJwtSecret()).toThrow(/JWT_SECRET/);
  });

  it("getJwtSecret throws when too short", async () => {
    process.env.JWT_SECRET = "short";
    const { getJwtSecret } = await import("./jwt-secret");
    expect(() => getJwtSecret()).toThrow(/32/);
  });

  it("getJwtSecret returns trimmed secret when valid", async () => {
    process.env.JWT_SECRET = "  vitest-jwt-secret-placeholder-min-32chars!  ";
    const { getJwtSecret } = await import("./jwt-secret");
    expect(getJwtSecret()).toBe("vitest-jwt-secret-placeholder-min-32chars!");
  });

  it("assertJwtSecretConfigured delegates to getJwtSecret", async () => {
    process.env.JWT_SECRET = "vitest-jwt-secret-placeholder-min-32chars!";
    const { assertJwtSecretConfigured } = await import("./jwt-secret");
    expect(() => assertJwtSecretConfigured()).not.toThrow();
  });
});
