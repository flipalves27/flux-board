import { describe, it, expect } from "vitest";
import type { SprintData } from "@/lib/schemas";
import type { DeliveryCardLike, DeliverySprintLike } from "@/lib/delivery-calendar";
import {
  buildDefaultScheduleWindow,
  buildScheduleSprintLanes,
  positionOnWindow,
  sortSprintsForSchedule,
  zoomScheduleWindow,
} from "./delivery-schedule";

describe("sortSprintsForSchedule", () => {
  it("orders by start date when available", () => {
    const s: DeliverySprintLike[] = [
      { id: "b", name: "B", status: "closed", startDate: "2026-02-01", endDate: "2026-02-15", cardIds: [], doneCardIds: [] },
      { id: "a", name: "A", status: "closed", startDate: "2026-01-01", endDate: "2026-01-15", cardIds: [], doneCardIds: [] },
    ];
    expect(sortSprintsForSchedule(s).map((x) => x.id)).toEqual(["a", "b"]);
  });
});

describe("buildScheduleSprintLanes", () => {
  it("flags due milestone outside sprint window", () => {
    const sprints: DeliverySprintLike[] = [
      {
        id: "sp1",
        name: "S1",
        status: "active",
        startDate: "2026-03-01",
        endDate: "2026-03-14",
        cardIds: ["c1"],
        doneCardIds: [],
      },
    ];
    const cards: DeliveryCardLike[] = [
      { id: "c1", title: "T", dueDate: "2026-04-01" },
    ];
    const w = { startMs: 0, endMs: 8_000_000_000_000 };
    const { lanes } = buildScheduleSprintLanes({ sprints, cards, window: w });
    const m0 = lanes[0]?.milestones[0];
    expect(m0?.outOfSprintWindow).toBe(true);
  });

  it("puts sprints without dates in unscheduled", () => {
    const s: DeliverySprintLike[] = [
      { id: "x", name: "X", status: "planning", startDate: null, endDate: null, cardIds: [], doneCardIds: [] },
    ];
    const { unscheduled, lanes } = buildScheduleSprintLanes({
      sprints: s,
      cards: [],
      window: { startMs: 0, endMs: 1 },
    });
    expect(unscheduled).toHaveLength(1);
    expect(lanes[0]?.hasTimeline).toBe(false);
  });

  it("exposes latest burndown from full sprint payload", () => {
    const sprints: DeliverySprintLike[] = [
      { id: "1", name: "S", status: "active", startDate: "2026-01-01", endDate: "2026-01-15", cardIds: [], doneCardIds: [] },
    ];
    const full: SprintData[] = [
      {
        id: "1",
        orgId: "o",
        boardId: "b",
        name: "S",
        goal: "",
        status: "active",
        startDate: "2026-01-01",
        endDate: "2026-01-15",
        velocity: null,
        cardIds: [],
        doneCardIds: [],
        ceremonyIds: [],
        burndownSnapshots: [
          {
            date: "2026-01-10",
            remainingCards: 4,
            completedToday: 1,
            addedToday: 0,
            idealRemaining: 3,
          },
        ],
        addedMidSprint: [],
        removedCardIds: [],
        cadenceType: "timebox",
        reviewCadenceDays: null,
        wipPolicyNote: "",
        plannedCapacity: null,
        commitmentNote: "",
        definitionOfDoneItemIds: [],
        sprintGoalHistory: [],
        programIncrementId: null,
        sprintTags: [],
        customFields: {},
        createdAt: "a",
        updatedAt: "b",
      },
    ];
    const { lanes } = buildScheduleSprintLanes({
      sprints,
      fullSprints: full,
      cards: [],
      window: { startMs: 0, endMs: 1e12 },
    });
    expect(lanes[0]?.latestBurndown).toEqual({ at: "2026-01-10", remaining: 4 });
  });
});

describe("windows", () => {
  it("buildDefaultScheduleWindow and zoom are symmetric", () => {
    const t = Date.parse("2026-01-15T00:00:00.000Z");
    const w0 = buildDefaultScheduleWindow(t, "month");
    const w1 = zoomScheduleWindow(w0, 0.5);
    const span0 = w0.endMs - w0.startMs;
    const span1 = w1.endMs - w1.startMs;
    expect(span1).toBeCloseTo(span0 * 0.5);
  });

  it("positionOnWindow maps to 0..1", () => {
    const w = { startMs: 0, endMs: 100 };
    expect(positionOnWindow(50, w)).toBe(0.5);
  });
});
