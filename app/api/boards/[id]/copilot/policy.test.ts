import { beforeEach, describe, expect, it, vi } from "vitest";
import { enforceCopilotGetPolicy, enforceCopilotPostPolicy } from "./policy";

vi.mock("@/lib/kv-organizations", () => ({ getOrganizationById: vi.fn() }));
vi.mock("@/lib/kv-boards", () => ({ getBoard: vi.fn(), userCanAccessBoard: vi.fn() }));
vi.mock("@/lib/plan-gates", () => ({
  canUseFeature: vi.fn(() => true),
  getDailyAiCallsCap: vi.fn(() => null),
  getDailyAiCallsWindowMs: vi.fn(() => 86_400_000),
  getEffectiveTier: vi.fn(() => "free"),
  makeDailyAiCallsRateLimitKey: vi.fn(() => "daily"),
  planGateCtxFromAuthPayload: vi.fn(() => ({})),
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 0 })) }));
vi.mock("@/lib/kv-board-copilot", () => ({ getBoardCopilotChat: vi.fn() }));

import { getOrganizationById } from "@/lib/kv-organizations";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { getBoardCopilotChat } from "@/lib/kv-board-copilot";

describe("enforceCopilotPostPolicy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrganizationById).mockResolvedValue({ id: "org1" } as never);
    vi.mocked(userCanAccessBoard).mockResolvedValue(true as never);
    vi.mocked(getBoard).mockResolvedValue({ id: "b1", cards: [] } as never);
    vi.mocked(getBoardCopilotChat).mockResolvedValue({ freeDemoUsed: 0, messages: [] } as never);
  });

  it("returns ok with policy context for valid request", async () => {
    const out = await enforceCopilotPostPolicy({
      payload: { id: "u1", orgId: "org1", isAdmin: false },
      boardId: "b1",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.data.board.id).toBe("b1");
  });
});

describe("enforceCopilotGetPolicy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrganizationById).mockResolvedValue({ id: "org1" } as never);
    vi.mocked(userCanAccessBoard).mockResolvedValue(true as never);
    vi.mocked(getBoardCopilotChat).mockResolvedValue({ freeDemoUsed: 0, messages: [] } as never);
  });

  it("returns tier and chat for allowed board access", async () => {
    const out = await enforceCopilotGetPolicy({
      payload: { id: "u1", orgId: "org1", isAdmin: false },
      boardId: "b1",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.data.tier).toBe("free");
    expect(Array.isArray(out.data.chat.messages)).toBe(true);
  });
});

