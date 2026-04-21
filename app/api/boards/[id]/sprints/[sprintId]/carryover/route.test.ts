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
vi.mock("@/lib/kv-sprints", () => ({ getSprint: vi.fn(), createSprint: vi.fn() }));

import { getAuthFromRequest } from "@/lib/auth";
import { userCanAccessBoard } from "@/lib/kv-boards";
import { getSprint, createSprint } from "@/lib/kv-sprints";

describe("POST /api/boards/[id]/sprints/[sprintId]/carryover", () => {
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

  it("creates a next sprint with pending carryover cards", async () => {
    vi.mocked(getSprint).mockResolvedValue({
      id: "s1",
      boardId: "b1",
      name: "Sprint 15",
      goal: "goal",
      status: "closed",
      cardIds: ["c1", "c2", "c3"],
      doneCardIds: ["c1"],
      cadenceType: "timebox",
      reviewCadenceDays: null,
      wipPolicyNote: "",
      plannedCapacity: null,
      commitmentNote: "",
      definitionOfDoneItemIds: [],
      programIncrementId: null,
      sprintTags: [],
      customFields: {},
    } as never);
    vi.mocked(createSprint).mockResolvedValue({ id: "s2", name: "Sprint 15 (Carryover)" } as never);

    const req = new NextRequest("http://localhost/api/boards/b1/sprints/s1/carryover", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "b1", sprintId: "s1" }) });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(createSprint).toHaveBeenCalledWith(expect.objectContaining({ cardIds: ["c2", "c3"] }));
    expect(body.carryoverCardIds).toEqual(["c2", "c3"]);
  });
});

