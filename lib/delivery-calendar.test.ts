import { describe, it, expect } from "vitest";
import {
  aggregateDueDatesByDayInMonth,
  buildImmediateRiskList,
  buildSprintCardIndex,
  classifyCardDelivery,
  computeManagerKpis,
  dayKeyFromTime,
  filterCardsForSprint,
  sprintScopeCardIds,
  toDayKey,
} from "./delivery-calendar";
import type { DeliveryCardLike, DeliverySprintLike } from "./delivery-calendar";

describe("toDayKey", () => {
  it("reads YYYY-MM-DD prefix", () => {
    expect(toDayKey("2026-04-15T12:00:00.000Z")).toBe("2026-04-15");
  });

  it("returns null for empty", () => {
    expect(toDayKey("")).toBeNull();
    expect(toDayKey(null)).toBeNull();
  });
});

describe("sprint↔card maps", () => {
  it("unions cardIds and doneCardIds and maps both directions", () => {
    const sprints: DeliverySprintLike[] = [
      {
        id: "s1",
        name: "A",
        status: "active",
        startDate: null,
        endDate: null,
        cardIds: ["c1", "c2"],
        doneCardIds: ["c2", "c3"],
      },
    ];
    const { cardIdToSprintIds, sprintIdToCardIds } = buildSprintCardIndex(sprints);
    expect([...(sprintIdToCardIds.get("s1") ?? [])].sort()).toEqual(["c1", "c2", "c3"].sort());
    expect(cardIdToSprintIds.get("c1")).toEqual(["s1"]);
    expect(cardIdToSprintIds.get("c2")).toEqual(["s1"]);
  });

  it("scope set dedupes", () => {
    const s: DeliverySprintLike = {
      id: "x",
      name: "x",
      status: "planning",
      startDate: null,
      endDate: null,
      cardIds: ["a", "a"],
      doneCardIds: ["a"],
    };
    expect(sprintScopeCardIds(s).size).toBe(1);
  });
});

describe("aggregateDueDatesByDayInMonth", () => {
  it("groups by calendar day in month", () => {
    const cards: DeliveryCardLike[] = [
      { id: "a", title: "1", dueDate: "2026-03-02" },
      { id: "b", title: "2", dueDate: "2026-03-02T00:00:00.000Z" },
      { id: "c", title: "3", dueDate: "2026-04-01" },
    ];
    const m = aggregateDueDatesByDayInMonth(cards, 2026, 3);
    expect(m.get("2026-03-02")?.sort()).toEqual(["a", "b"]);
    expect(m.has("2026-04-01")).toBe(false);
  });
});

describe("classify + managerial KPIs", () => {
  it("classifies overdue and due_soon with injectable today", () => {
    const today = "2026-04-10";
    const soon: DeliveryCardLike = { id: "1", title: "x", dueDate: "2026-04-12" };
    const late: DeliveryCardLike = { id: "2", title: "y", dueDate: "2026-04-01" };
    const ok: DeliveryCardLike = { id: "3", title: "z", dueDate: "2026-05-01" };
    expect(classifyCardDelivery(soon, today, 7)).toBe("due_soon");
    expect(classifyCardDelivery(late, today, 7)).toBe("overdue");
    expect(classifyCardDelivery(ok, today, 7)).toBe("ok");
  });

  it("manager KPIs count overdue and 7d window (board scope)", () => {
    const t0 = Date.parse("2026-04-10T12:00:00.000Z");
    const cards: DeliveryCardLike[] = [
      { id: "d", title: "done", dueDate: "2026-04-01", completedAt: "2026-04-02T00:00:00.000Z" },
      { id: "o", title: "old", dueDate: "2026-04-01" },
      { id: "w", title: "week", dueDate: "2026-04-12" },
      { id: "n", title: "nodue" },
    ];
    const k = computeManagerKpis(cards, { nowMs: t0, riskDays: 7 });
    expect(k.overdue).toBe(1);
    expect(k.dueSoon).toBe(1);
    expect(k.done).toBe(1);
    expect(k.noDue).toBe(1);
  });

  it("filters by sprint scope for KPIs", () => {
    const t0 = Date.parse("2026-01-20T00:00:00.000Z");
    const sprint: DeliverySprintLike = {
      id: "sp",
      name: "S",
      status: "active",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      cardIds: ["a"],
      doneCardIds: [],
    };
    const cards: DeliveryCardLike[] = [
      { id: "a", title: "in", dueDate: "2026-01-25" },
      { id: "b", title: "out", dueDate: "2026-01-25" },
    ];
    const k = computeManagerKpis(cards, { nowMs: t0, riskDays: 7, sprint });
    expect(k.totalCards).toBe(1);
  });
});

describe("risk list", () => {
  it("orders overdue before due_soon, then by date", () => {
    const t0 = dayKeyFromTime(Date.parse("2026-06-01T00:00:00.000Z"));
    const cards: DeliveryCardLike[] = [
      { id: "1", title: "soon1", dueDate: "2026-06-03" },
      { id: "2", title: "over", dueDate: "2026-05-20" },
      { id: "3", title: "soon2", dueDate: "2026-06-02" },
    ];
    const r = buildImmediateRiskList(cards, { nowMs: Date.parse(`${t0}T12:00:00.000Z`), riskDays: 7 });
    expect(r[0]?.card.id).toBe("2");
  });
});

describe("filterCardsForSprint", () => {
  it("keeps only in-scope cards", () => {
    const sp: DeliverySprintLike = {
      id: "s",
      name: "S",
      status: "active",
      startDate: null,
      endDate: null,
      cardIds: ["x"],
      doneCardIds: ["y"],
    };
    const cards: DeliveryCardLike[] = [
      { id: "x", title: "a" },
      { id: "z", title: "b" },
    ];
    expect(filterCardsForSprint(cards, sp).map((c) => c.id)).toEqual(["x"]);
  });
});
