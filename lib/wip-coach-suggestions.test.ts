import { describe, expect, it } from "vitest";
import type { BoardData } from "@/lib/kv-boards";
import { buildWipCoachPackage } from "./wip-coach-suggestions";

describe("buildWipCoachPackage", () => {
  it("suggests prioritize when WIP exceeded", () => {
    const board = {
      version: "1",
      lastUpdated: new Date().toISOString(),
      cards: [
        {
          id: "a",
          bucket: "col1",
          priority: "Urgente",
          progress: "Em andamento",
          title: "T1",
          desc: "",
          tags: [],
          direction: null,
          dueDate: null,
          order: 0,
        },
        {
          id: "b",
          bucket: "col1",
          priority: "Média",
          progress: "Em andamento",
          title: "T2",
          desc: "",
          tags: [],
          direction: null,
          dueDate: null,
          order: 1,
        },
      ],
      config: {
        bucketOrder: [{ key: "col1", label: "Doing", color: "#fff", wipLimit: 1 }],
        collapsedColumns: [],
      },
    } as unknown as BoardData;

    const pack = buildWipCoachPackage(board, [{ key: "col1", label: "Doing", wipLimit: 1 }]);
    expect(pack.nudges.some((n) => n.type === "wip_limit_exceeded")).toBe(true);
    expect(pack.actions.some((a) => a.kind === "prioritize_card")).toBe(true);
  });
});
