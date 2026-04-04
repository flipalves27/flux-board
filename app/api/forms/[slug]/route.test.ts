import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

vi.mock("@/lib/kv-intake-forms", () => ({
  getIntakeFormIndexBySlug: vi.fn(),
}));

vi.mock("@/lib/kv-boards", () => ({
  getBoard: vi.fn(),
  updateBoardFromExisting: vi.fn(),
}));

import { getIntakeFormIndexBySlug } from "@/lib/kv-intake-forms";

describe("GET /api/forms/[slug]", () => {
  beforeEach(() => {
    vi.mocked(getIntakeFormIndexBySlug).mockReset();
  });

  it("returns 400 when slug normalizes to empty", async () => {
    const req = new NextRequest("http://localhost/api/forms/@@@");
    const res = await GET(req, { params: Promise.resolve({ slug: "@@@" }) });
    expect(res.status).toBe(400);
  });

  it("returns 404 when form index missing", async () => {
    vi.mocked(getIntakeFormIndexBySlug).mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/forms/demo");
    const res = await GET(req, { params: Promise.resolve({ slug: "demo" }) });
    expect(res.status).toBe(404);
  });
});
