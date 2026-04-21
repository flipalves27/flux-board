import { describe, it, expect } from "vitest";
import { isBoardRole } from "./kv-board-members";

describe("isBoardRole", () => {
  it("accepts known roles", () => {
    expect(isBoardRole("editor")).toBe(true);
    expect(isBoardRole("admin")).toBe(true);
    expect(isBoardRole("owner")).toBe(false);
  });
});
