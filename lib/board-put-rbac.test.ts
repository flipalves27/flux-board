import { describe, expect, it } from "vitest";
import { boardUpdateRequiresAdmin } from "./board-put-rbac";

const base = {
  id: "b1",
  orgId: "o1",
  ownerId: "u1",
  name: "B",
  version: "1",
  lastUpdated: "2020-01-01",
  config: {
    bucketOrder: [{ key: "a", label: "A", color: "x" }],
    collapsedColumns: [] as string[],
  },
  cards: [],
} as const as unknown as import("@/lib/kv-boards").BoardData;

describe("boardUpdateRequiresAdmin", () => {
  it("is false for cards-only", () => {
    expect(
      boardUpdateRequiresAdmin(
        { cards: [{ id: "c1", title: "t", bucket: "a", order: 0, priority: "M", progress: "P", desc: "" }] } as any,
        base,
        ""
      )
    ).toBe(false);
  });

  it("is true for wipOverrideReason", () => {
    expect(boardUpdateRequiresAdmin({ cards: [] } as any, base, "12345678")).toBe(true);
  });

  it("is true when WIP in bucket changes", () => {
    const upd = {
      config: {
        ...base.config!,
        bucketOrder: [{ key: "a", label: "A", color: "x", wipLimit: 5 }],
      },
    } as any;
    expect(boardUpdateRequiresAdmin(upd, base, "")).toBe(true);
  });

  it("is true when name changes", () => {
    expect(boardUpdateRequiresAdmin({ name: "Novo" } as any, base, "")).toBe(true);
  });
});
