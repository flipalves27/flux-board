import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { verifyCronSecret } from "@/lib/cron-secret";

describe("verifyCronSecret", () => {
  const prev = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...prev };
  });

  afterEach(() => {
    process.env = { ...prev };
  });

  it("allows missing secret in non-production", () => {
    delete process.env.VERCEL_ENV;
    delete process.env.AUTOMATION_CRON_SECRET;
    const req = new NextRequest("http://localhost/api/cron/x", { headers: {} });
    expect(verifyCronSecret(req, ["AUTOMATION_CRON_SECRET"])).toBe(true);
  });

  it("denies missing secret in production", () => {
    process.env.VERCEL_ENV = "production";
    delete process.env.AUTOMATION_CRON_SECRET;
    const req = new NextRequest("http://localhost/api/cron/x", { headers: {} });
    expect(verifyCronSecret(req, ["AUTOMATION_CRON_SECRET"])).toBe(false);
  });

  it("accepts matching header", () => {
    process.env.VERCEL_ENV = "production";
    process.env.AUTOMATION_CRON_SECRET = "abc";
    const req = new NextRequest("http://localhost/api/cron/x", {
      headers: { "x-cron-secret": "abc" },
    });
    expect(verifyCronSecret(req, ["AUTOMATION_CRON_SECRET"])).toBe(true);
  });
});
