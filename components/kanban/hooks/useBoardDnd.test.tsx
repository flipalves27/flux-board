import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useBoardDnd } from "./useBoardDnd";

describe("useBoardDnd", () => {
  it("exposes sensors, collision detection, and null activeCard when idle", () => {
    const moveCardsBatch = vi.fn();
    const reorderColumns = vi.fn();
    const getCardsByBucket = () => [];

    const { result } = renderHook(() =>
      useBoardDnd({
        buckets: [{ key: "a", label: "A", color: "#000" }],
        cards: [],
        getCardsByBucket,
        moveCardsBatch,
        reorderColumns,
      })
    );

    expect(result.current.sensors).toBeDefined();
    expect(result.current.collisionDetection).toBeTypeOf("function");
    expect(result.current.activeId).toBeNull();
    expect(result.current.activeCard).toBeNull();
    expect(result.current.parseSlotId("slot-a-0")).toEqual({ bucketKey: "a", index: 0 });
  });
});
