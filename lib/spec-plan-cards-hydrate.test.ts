import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  dedupeSlimCardRows,
  hydrateSpecPlanCardRows,
} from "@/lib/spec-plan-cards-hydrate";

const workItems = [
  { id: "w1", title: "T1", description: "D1", type: "story", suggestedTags: [] as string[] },
  { id: "w2", title: "T2", description: "D2", type: "task", suggestedTags: [] as string[] },
];

describe("dedupeSlimCardRows", () => {
  it("keeps the first row per workItemId", () => {
    const rows = dedupeSlimCardRows([
      {
        workItemId: "w1",
        bucketKey: "a",
        bucketRationale: "first",
        priority: "Média",
        tags: [],
        rationale: "",
        blockedByTitles: [],
        subtasks: [],
      },
      {
        workItemId: "w1",
        bucketKey: "b",
        bucketRationale: "second",
        priority: "Média",
        tags: [],
        rationale: "",
        blockedByTitles: [],
        subtasks: [],
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.bucketKey).toBe("a");
  });
});

describe("hydrateSpecPlanCardRows", () => {
  it("copies title and description from work items and sets progress", () => {
    const { cardRows, bucketMappingRows } = hydrateSpecPlanCardRows({
      workItems,
      slimRows: [
        {
          workItemId: "w1",
          bucketKey: "todo",
          bucketRationale: "because",
          priority: "Importante",
          tags: ["x"],
          rationale: "plan",
          blockedByTitles: [],
          subtasks: [{ title: "S1", status: "pending" as const }],
        },
      ],
      allowSubtasks: true,
    });
    expect(cardRows).toHaveLength(1);
    expect(cardRows[0]?.title).toBe("T1");
    expect(cardRows[0]?.desc).toBe("D1");
    expect(cardRows[0]?.progress).toBe("Não iniciado");
    expect(cardRows[0]?.subtasks).toEqual([{ title: "S1", status: "pending" }]);
    expect(bucketMappingRows[0]).toEqual({ workItemId: "w1", bucketKey: "todo", why: "because" });
  });

  it("forces subtasks empty when allowSubtasks is false", () => {
    const { cardRows } = hydrateSpecPlanCardRows({
      workItems,
      slimRows: [
        {
          workItemId: "w1",
          bucketKey: "todo",
          bucketRationale: "r",
          priority: "Média",
          tags: [],
          rationale: "",
          blockedByTitles: [],
          subtasks: [{ title: "Should drop", status: "pending" as const }],
        },
      ],
      allowSubtasks: false,
    });
    expect(cardRows[0]?.subtasks).toEqual([]);
  });

  it("skips rows whose workItemId is not in work items", () => {
    const { cardRows, bucketMappingRows } = hydrateSpecPlanCardRows({
      workItems,
      slimRows: [
        {
          workItemId: "missing",
          bucketKey: "todo",
          bucketRationale: "r",
          priority: "Média",
          tags: [],
          rationale: "",
          blockedByTitles: [],
          subtasks: [],
        },
      ],
      allowSubtasks: false,
    });
    expect(cardRows).toEqual([]);
    expect(bucketMappingRows).toEqual([]);
  });

  it("normalizes unknown priority to Média", () => {
    const { cardRows } = hydrateSpecPlanCardRows({
      workItems,
      slimRows: [
        {
          workItemId: "w2",
          bucketKey: "x",
          bucketRationale: "r",
          priority: "Low",
          tags: [],
          rationale: "",
          blockedByTitles: [],
          subtasks: [],
        },
      ],
      allowSubtasks: false,
    });
    expect(cardRows[0]?.priority).toBe("Média");
  });
});
