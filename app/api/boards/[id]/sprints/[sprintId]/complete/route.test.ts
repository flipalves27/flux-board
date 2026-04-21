import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

vi.mock("@/lib/auth", () => ({ getAuthFromRequest: vi.fn() }));
vi.mock("@/lib/kv-boards", () => ({ getBoard: vi.fn(), userCanAccessBoard: vi.fn() }));
vi.mock("@/lib/kv-organizations", () => ({ getOrganizationById: vi.fn() }));
vi.mock("@/lib/plan-gates", () => ({
  assertFeatureAllowed: vi.fn(),
  planGateCtxFromAuthPayload: vi.fn(() => ({})),
}));
vi.mock("@/lib/kv-sprints", () => ({ getSprint: vi.fn(), updateSprint: vi.fn() }));

import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { getSprint, updateSprint } from "@/lib/kv-sprints";

describe("POST /api/boards/[id]/sprints/[sprintId]/complete", () => {
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

  it("moves sprint to review and computes velocity by story points", async () => {
    vi.mocked(getSprint).mockResolvedValue({
      id: "s1",
      boardId: "b1",
      status: "active",
      cardIds: ["c1", "c2", "c3"],
      endDate: null,
    } as never);
    vi.mocked(getBoard).mockResolvedValue({
      cards: [
        { id: "c1", progress: "Concluída", storyPoints: 3 },
        { id: "c2", progress: "Concluída", storyPoints: 5 },
        { id: "c3", progress: "Em andamento" },
      ],
    } as never);
    vi.mocked(updateSprint).mockResolvedValue({ id: "s1", status: "review", velocity: 8 } as never);

    const req = new NextRequest("http://localhost/api/boards/b1/sprints/s1/complete", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "b1", sprintId: "s1" }) });

    expect(res.status).toBe(200);
    expect(updateSprint).toHaveBeenCalledWith(
      "org1",
      "s1",
      expect.objectContaining({
        status: "review",
        doneCardIds: ["c1", "c2"],
        velocity: 8,
      })
    );
  });
});

