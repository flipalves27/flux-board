import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

vi.mock("@/lib/kv-organizations", () => ({
  getOrganizationByCustomDomain: vi.fn(),
}));

import { getOrganizationByCustomDomain } from "@/lib/kv-organizations";

describe("POST /api/internal/resolve-host", () => {
  beforeEach(() => {
    vi.mocked(getOrganizationByCustomDomain).mockReset();
    delete process.env.INTERNAL_HOST_RESOLVE_SECRET;
    delete process.env.RATE_LIMIT_INTERNAL_SECRET;
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = "test";
  });

  it("requires INTERNAL_HOST_RESOLVE_SECRET and rejects when missing", async () => {
    const req = new NextRequest("http://localhost/api/internal/resolve-host", {
      method: "POST",
      body: JSON.stringify({ host: "acme.example.com" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("authorizes with INTERNAL_HOST_RESOLVE_SECRET and resolves org", async () => {
    process.env.INTERNAL_HOST_RESOLVE_SECRET = "host-resolve-secret-32chars-minimum!!";
    vi.mocked(getOrganizationByCustomDomain).mockResolvedValue({ _id: "org_1" } as any);
    const req = new NextRequest("http://localhost/api/internal/resolve-host", {
      method: "POST",
      headers: { "x-internal-host-secret": "host-resolve-secret-32chars-minimum!!" },
      body: JSON.stringify({ host: "acme.example.com" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { orgId: string };
    expect(body.orgId).toBe("org_1");
  });
});
