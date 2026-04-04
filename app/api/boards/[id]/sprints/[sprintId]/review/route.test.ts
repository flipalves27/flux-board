import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

vi.mock("@/lib/auth", () => ({ getAuthFromRequest: vi.fn() }));
vi.mock("@/lib/kv-boards", () => ({ getBoard: vi.fn(), userCanAccessBoard: vi.fn() }));
vi.mock("@/lib/kv-organizations", () => ({ getOrganizationById: vi.fn() }));
vi.mock("@/lib/plan-gates", () => ({
  assertFeatureAllowed: vi.fn(),
  getDailyAiCallsCap: vi.fn(() => null),
  getDailyAiCallsWindowMs: vi.fn(() => 86_400_000),
  makeDailyAiCallsRateLimitKey: vi.fn(() => "k"),
  planGateCtxFromAuthPayload: vi.fn(() => ({})),
}));
vi.mock("@/lib/kv-sprints", () => ({ getSprint: vi.fn() }));
vi.mock("@/lib/ceremony-review", () => ({ generateSprintReview: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn() }));

import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { getSprint } from "@/lib/kv-sprints";
import { generateSprintReview } from "@/lib/ceremony-review";

describe("POST /api/boards/[id]/sprints/[sprintId]/review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthFromRequest).mockResolvedValue({
      id: "u1",
      orgId: "org1",
      isAdmin: false,
      username: "user",
    } as never);
    vi.mocked(userCanAccessBoard).mockResolvedValue(true as never);
  });

  it("returns generated review payload", async () => {
    vi.mocked(getSprint).mockResolvedValue({ id: "s1", boardId: "b1" } as never);
    vi.mocked(getBoard).mockResolvedValue({ id: "b1", cards: [] } as never);
    vi.mocked(generateSprintReview).mockResolvedValue({ summary: "ok" } as never);

    const req = new NextRequest("http://localhost/api/boards/b1/sprints/s1/review", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "b1", sprintId: "s1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.review).toEqual({ summary: "ok" });
  });
});

