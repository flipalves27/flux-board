import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getAuthFromRequest: vi.fn() }));
vi.mock("@/lib/kv-organizations", () => ({ getOrganizationById: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 0 })),
}));

import { getAuthFromRequest } from "@/lib/auth";
import { getOrganizationById } from "@/lib/kv-organizations";

describe("POST /api/fluxy/classify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthFromRequest).mockResolvedValue({
      id: "u1",
      orgId: "org1",
      isAdmin: false,
      username: "user",
    } as never);
    vi.mocked(getOrganizationById).mockResolvedValue({
      id: "org1",
      ui: { onda4: { enabled: true, omnibar: true } },
    } as never);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getAuthFromRequest).mockResolvedValue(null as never);
    const req = new NextRequest("http://localhost/api/fluxy/classify", {
      method: "POST",
      body: JSON.stringify({ text: "boards" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 when omnibar flag off", async () => {
    vi.mocked(getOrganizationById).mockResolvedValue({
      id: "org1",
      ui: { onda4: { enabled: true, omnibar: false } },
    } as never);
    const req = new NextRequest("http://localhost/api/fluxy/classify", {
      method: "POST",
      body: JSON.stringify({ text: "boards", locale: "pt-BR", context: { localOnly: true } }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("classifies with localOnly (no LLM)", async () => {
    const req = new NextRequest("http://localhost/api/fluxy/classify", {
      method: "POST",
      body: JSON.stringify({
        text: "quadros",
        locale: "pt-BR",
        context: { pathname: "/pt-BR/boards", localOnly: true },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { intent?: string; results?: unknown[]; meta?: { classifierTier?: string } };
    expect(body.intent).toBe("nav_boards");
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.meta?.classifierTier).toBe("local");
  });
});
