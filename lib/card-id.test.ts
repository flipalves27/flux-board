import { describe, expect, it } from "vitest";
import { formatCardSequence, nextBoardCardId, parseCardSequence } from "./card-id";

describe("card-id helpers", () => {
  it("formats sequence with numeric four-digit padding", () => {
    expect(formatCardSequence(1)).toBe("0001");
    expect(formatCardSequence(42)).toBe("0042");
    expect(formatCardSequence(12345)).toBe("12345");
  });

  it("parses numeric IDs and keeps legacy ID-prefix compatibility", () => {
    expect(parseCardSequence("0001")).toBe(1);
    expect(parseCardSequence("25")).toBe(25);
    expect(parseCardSequence("ID0001")).toBe(1);
    expect(parseCardSequence("id0025")).toBe(25);
    expect(parseCardSequence("FORM-123")).toBeNull();
  });

  it("starts from 0001 when there are no sequential IDs", () => {
    expect(nextBoardCardId([])).toBe("0001");
    expect(nextBoardCardId(["FORM-1", "ABC"])).toBe("0001");
  });

  it("continues from the highest sequential card ID", () => {
    expect(nextBoardCardId(["0001", "0002", "0010"])).toBe("0011");
  });

  it("continues sequence when only legacy IDs exist", () => {
    expect(nextBoardCardId(["ID0001", "ID0002", "ID0010"])).toBe("0011");
  });

  it("skips collisions and finds the next available numeric id", () => {
    expect(nextBoardCardId(["0001", "0002", "0003", "0004", "0005", "0006", "0007", "0008", "0009", "0010", "0011"])).toBe("0012");
  });
});
