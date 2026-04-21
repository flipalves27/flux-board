import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 0 })),
}));

vi.mock("@/lib/kv-embed", () => ({
  getEmbedByToken: vi.fn(),
}));

vi.mock("@/lib/kv-boards", () => ({
  getBoard: vi.fn(),
}));

vi.mock("@/lib/kv-organizations", () => ({
  getOrganizationById: vi.fn(),
}));

import { getEmbedByToken } from "@/lib/kv-embed";
import { getBoard } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";

describe("GET /api/embed/[token]/data", () => {
  beforeEach(() => {
    vi.mocked(getEmbedByToken).mockReset();
    vi.mocked(getBoard).mockReset();
    vi.mocked(getOrganizationById).mockReset();
  });

  it("returns 400 when token is empty", async () => {
    const req = new NextRequest("http://localhost/api/embed//data");
    const res = await GET(req, { params: Promise.resolve({ token: "" }) });
    expect(res.status).toBe(400);
  });

  it("returns 404 when embed token unknown", async () => {
    vi.mocked(getEmbedByToken).mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/embed/tok/data");
    const res = await GET(req, { params: Promise.resolve({ token: "unknown" }) });
    expect(res.status).toBe(404);
  });
});
