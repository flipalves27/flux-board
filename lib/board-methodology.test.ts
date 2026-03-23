import { describe, expect, it } from "vitest";
import {
  defaultBucketOrderForMethodology,
  inferLegacyBoardMethodology,
  initialBoardPayloadForMethodology,
} from "./board-methodology";

describe("board-methodology", () => {
  it("inferLegacyBoardMethodology uses sprints as Scrum signal", () => {
    expect(inferLegacyBoardMethodology(true)).toBe("scrum");
    expect(inferLegacyBoardMethodology(false)).toBe("kanban");
  });

  it("defaultBucketOrderForMethodology returns five columns", () => {
    expect(defaultBucketOrderForMethodology("scrum")).toHaveLength(5);
    expect(defaultBucketOrderForMethodology("kanban")).toHaveLength(5);
  });

  it("initialBoardPayloadForMethodology sets backlog key for Scrum", () => {
    const scrum = initialBoardPayloadForMethodology("scrum");
    expect(scrum.boardMethodology).toBe("scrum");
    expect(scrum.config?.backlogBucketKey).toBe("backlog");

    const kanban = initialBoardPayloadForMethodology("kanban");
    expect(kanban.boardMethodology).toBe("kanban");
    expect(kanban.config?.backlogBucketKey).toBeUndefined();
  });
});
