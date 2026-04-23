import { describe, expect, it } from "vitest";
import {
  defaultBucketOrderForMethodology,
  inferLegacyBoardMethodology,
  initialBoardPayloadForMethodology,
  isSprintMethodology,
} from "./board-methodology";

describe("board-methodology", () => {
  it("inferLegacyBoardMethodology uses sprints as Scrum signal", () => {
    expect(inferLegacyBoardMethodology(true)).toBe("scrum");
    expect(inferLegacyBoardMethodology(false)).toBe("kanban");
  });

  it("isSprintMethodology groups scrum and safe", () => {
    expect(isSprintMethodology("scrum")).toBe(true);
    expect(isSprintMethodology("safe")).toBe(true);
    expect(isSprintMethodology("kanban")).toBe(false);
  });

  it("defaultBucketOrderForMethodology returns five columns", () => {
    expect(defaultBucketOrderForMethodology("scrum")).toHaveLength(5);
    expect(defaultBucketOrderForMethodology("kanban")).toHaveLength(5);
    expect(defaultBucketOrderForMethodology("lean_six_sigma")).toHaveLength(5);
    expect(defaultBucketOrderForMethodology("discovery")).toHaveLength(5);
    expect(defaultBucketOrderForMethodology("discovery").map((b) => b.key).slice(0, 2)).toEqual(["problema", "pesquisa"]);
    expect(defaultBucketOrderForMethodology("lean_six_sigma").map((b) => b.key)).toEqual([
      "define",
      "measure",
      "analyze",
      "improve",
      "control",
    ]);
    expect(defaultBucketOrderForMethodology("safe")).toHaveLength(6);
    expect(defaultBucketOrderForMethodology("safe").map((b) => b.key).slice(0, 2)).toEqual([
      "program-backlog",
      "preparacao-wsjf",
    ]);
  });

  it("initialBoardPayloadForMethodology sets backlog key for Scrum", () => {
    const scrum = initialBoardPayloadForMethodology("scrum");
    expect(scrum.boardMethodology).toBe("scrum");
    expect(scrum.config?.backlogBucketKey).toBe("backlog");

    const kanban = initialBoardPayloadForMethodology("kanban");
    expect(kanban.boardMethodology).toBe("kanban");
    expect(kanban.config?.backlogBucketKey).toBeUndefined();

    const lss = initialBoardPayloadForMethodology("lean_six_sigma");
    expect(lss.boardMethodology).toBe("lean_six_sigma");
    expect(lss.config?.backlogBucketKey).toBeUndefined();
    expect(lss.config?.labels?.length).toBeGreaterThan(0);

    const disc = initialBoardPayloadForMethodology("discovery");
    expect(disc.boardMethodology).toBe("discovery");
    expect((disc.config?.labels ?? []).length).toBeGreaterThan(0);

    const safe = initialBoardPayloadForMethodology("safe");
    expect(safe.boardMethodology).toBe("safe");
    expect(safe.config?.backlogBucketKey).toBe("program-backlog");
    expect((safe.config?.labels ?? []).length).toBeGreaterThan(0);
  });
});
