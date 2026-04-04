import { describe, it, expect } from "vitest";
import { BurndownSnapshotSchema } from "./schemas";
import { mergeBurndownSnapshotRow } from "./sprint-burndown-snapshot";

describe("BurndownSnapshotSchema", () => {
  it("parses valid row", () => {
    const row = BurndownSnapshotSchema.parse({
      date: "2026-03-22",
      remainingCards: 5,
      completedToday: 2,
      addedToday: 0,
      idealRemaining: 4.5,
    });
    expect(row.date).toBe("2026-03-22");
  });

  it("rejects negative remainingCards", () => {
    expect(() =>
      BurndownSnapshotSchema.parse({
        date: "2026-03-22",
        remainingCards: -1,
        completedToday: 0,
        addedToday: 0,
        idealRemaining: 0,
      })
    ).toThrow();
  });
});

describe("mergeBurndownSnapshotRow", () => {
  const base = (date: string, rem: number): import("./schemas").BurndownSnapshot => ({
    date,
    remainingCards: rem,
    completedToday: 0,
    addedToday: 0,
    idealRemaining: rem,
  });

  it("replaces same date", () => {
    const out = mergeBurndownSnapshotRow([base("2026-03-20", 10), base("2026-03-21", 8)], base("2026-03-21", 3));
    expect(out.map((r) => r.remainingCards)).toEqual([10, 3]);
  });

  it("keeps at most 90 chronological rows", () => {
    const existing: import("./schemas").BurndownSnapshot[] = [];
    for (let i = 0; i < 95; i++) {
      const d = new Date(Date.UTC(2026, 0, 1 + i));
      existing.push({
        date: d.toISOString().slice(0, 10),
        remainingCards: i,
        completedToday: 0,
        addedToday: 0,
        idealRemaining: i,
      });
    }
    const merged = mergeBurndownSnapshotRow(existing, base("2026-04-07", 1));
    expect(merged.length).toBe(90);
  });
});
