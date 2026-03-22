import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

describe("validateServerEnv", () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...envSnapshot };
    process.env.JWT_SECRET = "vitest-jwt-secret-placeholder-min-32chars!";
  });

  afterEach(() => {
    process.env = { ...envSnapshot };
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("runs without throwing when JWT is set", async () => {
    const { validateServerEnv } = await import("./env-validate");
    expect(() => validateServerEnv()).not.toThrow();
  });

  it("is idempotent", async () => {
    const { validateServerEnv } = await import("./env-validate");
    validateServerEnv();
    expect(() => validateServerEnv()).not.toThrow();
  });

  it("warns in production when Stripe key is missing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.NODE_ENV = "production";
    delete process.env.STRIPE_SECRET_KEY;
    process.env.CRON_MASTER_SECRET = "x".repeat(32);
    delete process.env.AUTOMATION_CRON_SECRET;
    delete process.env.WEEKLY_DIGEST_SECRET;
    delete process.env.ALLOW_PUBLIC_BOARDS_CORS;
    const { validateServerEnv } = await import("./env-validate");
    validateServerEnv();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/STRIPE_SECRET_KEY/));
  });

  it("warns in production when cron secrets are missing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.NODE_ENV = "production";
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    delete process.env.CRON_MASTER_SECRET;
    delete process.env.AUTOMATION_CRON_SECRET;
    delete process.env.WEEKLY_DIGEST_SECRET;
    const { validateServerEnv } = await import("./env-validate");
    validateServerEnv();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/CRON_MASTER_SECRET/));
  });

  it("warns when ALLOW_PUBLIC_BOARDS_CORS=1 in production", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.NODE_ENV = "production";
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    process.env.CRON_MASTER_SECRET = "x".repeat(32);
    process.env.ALLOW_PUBLIC_BOARDS_CORS = "1";
    const { validateServerEnv } = await import("./env-validate");
    validateServerEnv();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/ALLOW_PUBLIC_BOARDS_CORS/));
  });
});
