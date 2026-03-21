import { describe, expect, it } from "vitest";
import { parseSlotId } from "./kanban-dnd-utils";

describe("parseSlotId", () => {
  it("parses slot id with bucket key containing dashes (last dash separates index)", () => {
    expect(parseSlotId("slot-Em Execução (Desenvolvimento)-2")).toEqual({
      bucketKey: "Em Execução (Desenvolvimento)",
      index: 2,
    });
  });

  it("returns null for non-slot ids", () => {
    expect(parseSlotId("bucket-foo")).toBeNull();
    expect(parseSlotId("card-1")).toBeNull();
  });

  it("returns null for invalid index", () => {
    expect(parseSlotId("slot-backlog-")).toBeNull();
    expect(parseSlotId("slot-backlog-x")).toBeNull();
  });
});
