import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

vi.mock("@/lib/kv-portal", () => ({
  getPortalIndexByToken: vi.fn(),
}));

vi.mock("@/lib/kv-boards", () => ({
  getBoard: vi.fn(),
}));

vi.mock("@/lib/kv-organizations", () => ({
  getOrganizationById: vi.fn(),
}));

import { getPortalIndexByToken } from "@/lib/kv-portal";

describe("GET /api/portal/[token]", () => {
  beforeEach(() => {
    vi.mocked(getPortalIndexByToken).mockReset();
  });

  it("returns 400 when token missing", async () => {
    const req = new NextRequest("http://localhost/api/portal/");
    const res = await GET(req, { params: Promise.resolve({ token: "" }) });
    expect(res.status).toBe(400);
  });

  it("returns 404 when portal index missing", async () => {
    vi.mocked(getPortalIndexByToken).mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/portal/x");
    const res = await GET(req, { params: Promise.resolve({ token: "x" }) });
    expect(res.status).toBe(404);
  });
});
