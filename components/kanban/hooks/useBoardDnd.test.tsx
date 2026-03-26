import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
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

  it("moves card when dropping over plain bucket key", () => {
    const moveCardsBatch = vi.fn();
    const reorderColumns = vi.fn();
    const cards = [
      {
        id: "C1",
        bucket: "todo",
        priority: "Média",
        progress: "Não iniciado",
        title: "Card 1",
        desc: "",
        tags: [],
        direction: null,
        dueDate: null,
        order: 0,
      },
      {
        id: "C2",
        bucket: "doing",
        priority: "Média",
        progress: "Não iniciado",
        title: "Card 2",
        desc: "",
        tags: [],
        direction: null,
        dueDate: null,
        order: 0,
      },
    ];
    const getCardsByBucket = (bucketKey: string) => cards.filter((c) => c.bucket === bucketKey);

    const { result } = renderHook(() =>
      useBoardDnd({
        buckets: [
          { key: "todo", label: "Todo", color: "#111" },
          { key: "doing", label: "Doing", color: "#222" },
        ],
        cards,
        getCardsByBucket,
        moveCardsBatch,
        reorderColumns,
      })
    );

    act(() => {
      result.current.handleDragEnd({
        active: { id: "card-C1", data: { current: { dragIds: ["C1"] } } },
        over: { id: "doing" },
      } as never);
    });

    expect(moveCardsBatch).toHaveBeenCalledWith(["C1"], "doing", 1);
  });

  it("moves card when dropping over another card id", () => {
    const moveCardsBatch = vi.fn();
    const reorderColumns = vi.fn();
    const cards = [
      {
        id: "C1",
        bucket: "todo",
        priority: "Média",
        progress: "Não iniciado",
        title: "Card 1",
        desc: "",
        tags: [],
        direction: null,
        dueDate: null,
        order: 0,
      },
      {
        id: "C2",
        bucket: "doing",
        priority: "Média",
        progress: "Não iniciado",
        title: "Card 2",
        desc: "",
        tags: [],
        direction: null,
        dueDate: null,
        order: 0,
      },
      {
        id: "C3",
        bucket: "doing",
        priority: "Média",
        progress: "Não iniciado",
        title: "Card 3",
        desc: "",
        tags: [],
        direction: null,
        dueDate: null,
        order: 1,
      },
    ];
    const getCardsByBucket = (bucketKey: string) => cards.filter((c) => c.bucket === bucketKey);

    const { result } = renderHook(() =>
      useBoardDnd({
        buckets: [
          { key: "todo", label: "Todo", color: "#111" },
          { key: "doing", label: "Doing", color: "#222" },
        ],
        cards,
        getCardsByBucket,
        moveCardsBatch,
        reorderColumns,
      })
    );

    act(() => {
      result.current.handleDragEnd({
        active: { id: "card-C1", data: { current: { dragIds: ["C1"] } } },
        over: { id: "card-C2" },
      } as never);
    });

    expect(moveCardsBatch).toHaveBeenCalledWith(["C1"], "doing", 0);
  });

  it("reorders columns even when over id uses bucket prefix", () => {
    const moveCardsBatch = vi.fn();
    const reorderColumns = vi.fn();
    const getCardsByBucket = () => [];

    const { result } = renderHook(() =>
      useBoardDnd({
        buckets: [
          { key: "todo", label: "Todo", color: "#111" },
          { key: "doing", label: "Doing", color: "#222" },
        ],
        cards: [],
        getCardsByBucket,
        moveCardsBatch,
        reorderColumns,
      })
    );

    act(() => {
      result.current.handleDragEnd({
        active: { id: "todo", data: { current: {} } },
        over: { id: "bucket-doing" },
      } as never);
    });

    expect(reorderColumns).toHaveBeenCalledWith(0, 1);
  });
});
