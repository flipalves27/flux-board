import { describe, expect, it, vi } from "vitest";
import { logSprintLifecycleEvent } from "./sprint-lifecycle-observability";

describe("logSprintLifecycleEvent", () => {
  it("emits structured lifecycle event payload", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logSprintLifecycleEvent({
      event: "sprint_start",
      orgId: "org_1",
      boardId: "board_1",
      sprintId: "sprint_1",
      doneCount: 0,
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const [raw] = spy.mock.calls[0];
    const parsed = JSON.parse(String(raw)) as Record<string, unknown>;
    expect(parsed.scope).toBe("sprint_lifecycle");
    expect(parsed.event).toBe("sprint_start");
    expect(parsed.orgId).toBe("org_1");
    expect(parsed.boardId).toBe("board_1");
    expect(parsed.sprintId).toBe("sprint_1");
    spy.mockRestore();
  });
});

