import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { useBoardState } from "./useBoardState";

describe("useBoardState", () => {
  it("exports a hook for board CRUD and side effects", () => {
    expect(typeof useBoardState).toBe("function");
  });
});
