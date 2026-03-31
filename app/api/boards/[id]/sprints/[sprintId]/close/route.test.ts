import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

vi.mock("@/lib/auth", () => ({ getAuthFromRequest: vi.fn() }));
vi.mock("@/lib/kv-boards", () => ({
  getBoard: vi.fn(),
  updateBoardFromExisting: vi.fn(),
  userCanAccessBoard: vi.fn(),
}));
vi.mock("@/lib/kv-organizations", () => ({ getOrganizationById: vi.fn() }));
vi.mock("@/lib/plan-gates", () => ({
  assertFeatureAllowed: vi.fn(),
  planGateCtxFromAuthPayload: vi.fn(() => ({})),
}));
vi.mock("@/lib/kv-sprints", () => ({ getSprint: vi.fn(), updateSprint: vi.fn() }));
vi.mock("@/lib/webhook-delivery", () => ({ enqueueWebhookDeliveriesForEvent: vi.fn() }));

import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { getSprint, updateSprint } from "@/lib/kv-sprints";

describe("POST /api/boards/[id]/sprints/[sprintId]/close", () => {
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

  it("returns carryover assist and velocity based on story points", async () => {
    vi.mocked(getSprint).mockResolvedValue({
      id: "s1",
      boardId: "b1",
      name: "Sprint 15",
      status: "review",
      cardIds: ["c1", "c2", "c3"],
      doneCardIds: ["c1", "c2"],
      burndownSnapshots: [],
    } as never);
    vi.mocked(getBoard).mockResolvedValue({
      id: "b1",
      cards: [
        { id: "c1", storyPoints: 3, tags: [] },
        { id: "c2", storyPoints: 5, tags: [] },
        { id: "c3", tags: [] },
      ],
    } as never);
    vi.mocked(updateSprint).mockResolvedValue({ id: "s1", status: "closed", velocity: 8 } as never);

    const req = new NextRequest("http://localhost/api/boards/b1/sprints/s1/close", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "b1", sprintId: "s1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(updateSprint).toHaveBeenCalledWith(
      "org1",
      "s1",
      expect.objectContaining({
        status: "closed",
        velocity: 8,
      })
    );
    expect(body.carryoverCardIds).toEqual(["c3"]);
    expect(body.carryoverAssist).toMatchObject({
      recommended: true,
      preselectedCardIds: ["c3"],
      suggestedSprintName: "Sprint 15 (Carryover)",
    });
  });
});

