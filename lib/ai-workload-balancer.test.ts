import { describe, it, expect } from "vitest";
import type { BoardData } from "./kv-boards";
import { computeWorkloadEntries } from "./ai-workload-balancer";

describe("computeWorkloadEntries", () => {
  it("aggregates open cards by assignee", () => {
    const board: BoardData = {
      id: "b1",
      orgId: "o",
      ownerId: "u",
      name: "B",
      cards: [
        { id: "1", assignee: "alice", progress: "Doing", priority: "Alta" },
        { id: "2", assignee: "alice", progress: "Doing", tags: ["bloqueado"] },
        { id: "3", assignee: "bob", progress: "Concluída" },
      ],
    };
    const rows = computeWorkloadEntries(board);
    const alice = rows.find((r) => r.memberId === "alice");
    expect(alice?.cardCount).toBe(2);
    expect(alice?.highPriorityCount).toBe(1);
    expect(alice?.blockedCount).toBe(1);
  });
});
