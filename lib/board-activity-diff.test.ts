import { describe, expect, it } from "vitest";
import { diffBoardActivity } from "./board-activity-diff";
import type { BoardSnapshotForActivity } from "./board-activity-types";

const base: BoardSnapshotForActivity = {
  id: "b_1",
  name: "Test",
  cards: [],
  config: {
    bucketOrder: [{ key: "a", label: "A", color: "#000" }],
  },
};

describe("diffBoardActivity", () => {
  it("detects card creation", () => {
    const next: BoardSnapshotForActivity = {
      ...base,
      cards: [{ id: "c1", bucket: "a", title: "Hello", priority: "Média", progress: "Não iniciado", order: 0 }],
    };
    const d = diffBoardActivity(base, next);
    expect(d.some((x) => x.action === "card.created")).toBe(true);
  });

  it("detects column add", () => {
    const next: BoardSnapshotForActivity = {
      ...base,
      config: {
        bucketOrder: [
          { key: "a", label: "A", color: "#000" },
          { key: "b", label: "B", color: "#111" },
        ],
      },
    };
    const d = diffBoardActivity(base, next);
    expect(d.some((x) => x.action === "column.added")).toBe(true);
  });

  it("emits nothing when snapshots match aside from lastUpdated-like fields we ignore", () => {
    const prev: BoardSnapshotForActivity = { ...base, cards: [{ id: "c1", bucket: "a", title: "T", priority: "Média", progress: "Não iniciado", order: 0 }] };
    const next: BoardSnapshotForActivity = { ...base, cards: [{ id: "c1", bucket: "a", title: "T", priority: "Média", progress: "Não iniciado", order: 0 }] };
    const d = diffBoardActivity(prev, next);
    expect(d.length).toBe(0);
  });
});
