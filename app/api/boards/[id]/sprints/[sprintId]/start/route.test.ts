import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

vi.mock("@/lib/auth", () => ({ getAuthFromRequest: vi.fn() }));
vi.mock("@/lib/kv-boards", () => ({ userCanAccessBoard: vi.fn() }));
vi.mock("@/lib/kv-organizations", () => ({ getOrganizationById: vi.fn() }));
vi.mock("@/lib/plan-gates", () => ({
  assertFeatureAllowed: vi.fn(),
  planGateCtxFromAuthPayload: vi.fn(() => ({})),
}));
vi.mock("@/lib/kv-sprints", () => ({
  getSprint: vi.fn(),
  updateSprint: vi.fn(),
  getActiveSprint: vi.fn(),
}));

import { getAuthFromRequest } from "@/lib/auth";
import { userCanAccessBoard } from "@/lib/kv-boards";
import { getSprint, updateSprint, getActiveSprint } from "@/lib/kv-sprints";

describe("POST /api/boards/[id]/sprints/[sprintId]/start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthFromRequest).mockResolvedValue({
      id: "u1",
      orgId: "org1",
      isAdmin: false,
      username: "user",
    } as never);
    vi.mocked(userCanAccessBoard).mockResolvedValue(true as never);
    vi.mocked(getActiveSprint).mockResolvedValue(null as never);
  });

  it("creates burndown t0 snapshot on start", async () => {
    vi.mocked(getSprint).mockResolvedValue({
      id: "s1",
      boardId: "b1",
      status: "planning",
      cardIds: ["c1", "c2"],
      burndownSnapshots: [],
      startDate: null,
    } as never);
    vi.mocked(updateSprint).mockResolvedValue({ id: "s1", status: "active" } as never);

    const req = new NextRequest("http://localhost/api/boards/b1/sprints/s1/start", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "b1", sprintId: "s1" }) });

    expect(res.status).toBe(200);
    expect(updateSprint).toHaveBeenCalledWith(
      "org1",
      "s1",
      expect.objectContaining({
        status: "active",
        burndownSnapshots: expect.arrayContaining([
          expect.objectContaining({
            remainingCards: 2,
            idealRemaining: 2,
          }),
        ]),
      })
    );
  });
});

