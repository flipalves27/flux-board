import { describe, expect, it } from "vitest";
import { BoardTemplateSnapshotSchema } from "./schemas";
import { defaultBucketOrderSafe } from "./board-methodology";

describe("template snapshot + schema with safe", () => {
  it("BoardTemplateSnapshotSchema accepts boardMethodology safe", () => {
    const snap = {
      config: {
        bucketOrder: defaultBucketOrderSafe().map((b) => ({ key: b.key, label: b.label, color: b.color })),
        collapsedColumns: [] as string[],
        labels: ["Feature"],
      },
      mapaProducao: [],
      labelPalette: [] as string[],
      automations: [] as unknown[],
      boardMethodology: "safe" as const,
    };
    const p = BoardTemplateSnapshotSchema.safeParse(snap);
    expect(p.success).toBe(true);
  });
});
