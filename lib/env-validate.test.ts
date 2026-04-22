import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

describe("validateServerEnv", () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...envSnapshot };
    process.env.JWT_SECRET = "vitest-jwt-secret-placeholder-min-32chars!";
    process.env.ADMIN_INITIAL_PASSWORD = "vitest-admin-initial-password!";
    delete process.env.NEXT_PUBLIC_VERCEL_BYPASS_SECRET;
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

  it("throws when NEXT_PUBLIC_VERCEL_BYPASS_SECRET is set on Vercel production", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.NEXT_PUBLIC_VERCEL_BYPASS_SECRET = "should-not-exist";
    const { validateServerEnv } = await import("./env-validate");
    expect(() => validateServerEnv()).toThrow(/NEXT_PUBLIC_VERCEL_BYPASS_SECRET/);
  });

  it("throws in production runtime when ADMIN_INITIAL_PASSWORD is missing", async () => {
    delete process.env.ADMIN_INITIAL_PASSWORD;
    process.env.NODE_ENV = "production";
    delete process.env.NEXT_PHASE;
    const { validateServerEnv } = await import("./env-validate");
    expect(() => validateServerEnv()).toThrow(/ADMIN_INITIAL_PASSWORD/);
  });

  it("warns in production when Google OAuth is configured but public URL, cookie domain, and allowlist are missing or empty", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.NODE_ENV = "production";
    delete process.env.NEXT_PHASE;
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    process.env.CRON_MASTER_SECRET = "x".repeat(32);
    process.env.AUTH_GOOGLE_CLIENT_ID = "g-id";
    process.env.AUTH_GOOGLE_CLIENT_SECRET = "g-secret";
    delete process.env.AUTH_MICROSOFT_CLIENT_ID;
    delete process.env.AUTH_MICROSOFT_CLIENT_SECRET;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.AUTH_COOKIE_DOMAIN;
    process.env.OAUTH_ALLOWED_PUBLIC_ORIGINS = "";
    const { validateServerEnv } = await import("./env-validate");
    validateServerEnv();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/NEXT_PUBLIC_APP_URL/));
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/AUTH_COOKIE_DOMAIN/));
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/OAUTH_ALLOWLIST|OAUTH_ALLOWED/));
  });

  it("warns in production when Google OAuth is configured and OAUTH allowlist is invalid (parse error)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.NODE_ENV = "production";
    delete process.env.NEXT_PHASE;
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    process.env.CRON_MASTER_SECRET = "x".repeat(32);
    process.env.AUTH_GOOGLE_CLIENT_ID = "g-id";
    process.env.AUTH_GOOGLE_CLIENT_SECRET = "g-secret";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    process.env.AUTH_COOKIE_DOMAIN = ".example.com";
    process.env.OAUTH_ALLOWED_PUBLIC_ORIGINS = "not[valid-json";
    const { validateServerEnv } = await import("./env-validate");
    validateServerEnv();
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/OAUTH_ALLOWED_PUBLIC_ORIGINS|OAUTH allowlist|inválido/i)
    );
  });

  it("warns in production when FLUX_ADMIN_SUPERPOWERS is enabled", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.NODE_ENV = "production";
    delete process.env.NEXT_PHASE;
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    process.env.CRON_MASTER_SECRET = "x".repeat(32);
    process.env.FLUX_ADMIN_SUPERPOWERS = "1";
    delete process.env.AUTH_GOOGLE_CLIENT_ID;
    delete process.env.AUTH_GOOGLE_CLIENT_SECRET;
    delete process.env.AUTH_MICROSOFT_CLIENT_ID;
    delete process.env.AUTH_MICROSOFT_CLIENT_SECRET;
    const { validateServerEnv } = await import("./env-validate");
    validateServerEnv();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/FLUX_ADMIN_SUPERPOWERS/));
  });
});
