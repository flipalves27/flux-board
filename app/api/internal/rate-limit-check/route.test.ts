import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

vi.mock("@/lib/global-api-rate-limit", () => ({
  runGlobalApiRateLimit: vi.fn(),
}));

import { runGlobalApiRateLimit } from "@/lib/global-api-rate-limit";

describe("POST /api/internal/rate-limit-check", () => {
  const prev = { ...process.env };

  beforeEach(() => {
    vi.mocked(runGlobalApiRateLimit).mockReset();
    process.env = { ...prev };
    process.env.RATE_LIMIT_INTERNAL_SECRET = "internal-rate-secret-32chars-min!!";
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    process.env = { ...prev };
  });

  it("returns 401 without valid internal header", async () => {
    const req = new NextRequest("http://localhost/api/internal/rate-limit-check", {
      method: "POST",
      body: JSON.stringify({ pathname: "/api/boards", method: "GET" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("does not fallback to JWT_SECRET for internal auth", async () => {
    delete process.env.RATE_LIMIT_INTERNAL_SECRET;
    process.env.JWT_SECRET = "jwt-secret-that-must-not-auth-internal-route";
    const req = new NextRequest("http://localhost/api/internal/rate-limit-check", {
      method: "POST",
      headers: { "x-flux-rate-internal": "jwt-secret-that-must-not-auth-internal-route" },
      body: JSON.stringify({ pathname: "/api/boards", method: "GET" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when pathname is not under /api/", async () => {
    vi.mocked(runGlobalApiRateLimit).mockResolvedValue({
      ok: true,
      category: "skipped",
      headers: {},
    });
    const req = new NextRequest("http://localhost/api/internal/rate-limit-check", {
      method: "POST",
      headers: { "x-flux-rate-internal": "internal-rate-secret-32chars-min!!" },
      body: JSON.stringify({ pathname: "/not-api/x", method: "GET" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 200 when authorized and pathname valid", async () => {
    vi.mocked(runGlobalApiRateLimit).mockResolvedValue({
      ok: true,
      category: "public",
      headers: { "X-Flux-Test": "1" },
    });
    const req = new NextRequest("http://localhost/api/internal/rate-limit-check", {
      method: "POST",
      headers: { "x-flux-rate-internal": "internal-rate-secret-32chars-min!!" },
      body: JSON.stringify({ pathname: "/api/boards", method: "GET", clientIp: "1.2.3.4" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Flux-Test")).toBe("1");
  });

  it("returns 429 when rate limiter denies", async () => {
    vi.mocked(runGlobalApiRateLimit).mockResolvedValue({
      ok: false,
      headers: { "Retry-After": "10" },
      message: "slow down",
      category: "ai",
      retryAfterSeconds: 10,
    });
    const req = new NextRequest("http://localhost/api/internal/rate-limit-check", {
      method: "POST",
      headers: { "x-flux-rate-internal": "internal-rate-secret-32chars-min!!" },
      body: JSON.stringify({ pathname: "/api/foo", method: "POST" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(429);
    const j = (await res.json()) as { code: string };
    expect(j.code).toBe("rate_limited");
  });
});
