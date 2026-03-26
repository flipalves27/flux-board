import { describe, expect, it } from "vitest";
import { formatCardSequence, nextBoardCardId, parseCardSequence } from "./card-id";

describe("card-id helpers", () => {
  it("formats sequence with ID prefix and four digits", () => {
    expect(formatCardSequence(1)).toBe("ID0001");
    expect(formatCardSequence(42)).toBe("ID0042");
    expect(formatCardSequence(12345)).toBe("ID12345");
  });

  it("parses only sequential IDs with ID prefix", () => {
    expect(parseCardSequence("ID0001")).toBe(1);
    expect(parseCardSequence("id0025")).toBe(25);
    expect(parseCardSequence("ID25")).toBeNull();
    expect(parseCardSequence("FORM-123")).toBeNull();
  });

  it("starts from ID0001 when there are no sequential IDs", () => {
    expect(nextBoardCardId([])).toBe("ID0001");
    expect(nextBoardCardId(["FORM-1", "ABC"])).toBe("ID0001");
  });

  it("continues from the highest sequential card ID", () => {
    expect(nextBoardCardId(["ID0001", "ID0002", "ID0010"])).toBe("ID0011");
  });

  it("skips collisions even with duplicated legacy IDs", () => {
    expect(nextBoardCardId(["ID0001", "ID0002", "ID0003", "ID0004", "ID0005", "ID0006", "ID0007", "ID0008", "ID0009", "ID0010", "ID0011"])).toBe("ID0012");
  });
});
