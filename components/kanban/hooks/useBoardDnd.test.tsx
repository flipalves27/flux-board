import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useBoardDnd } from "./useBoardDnd";

const makeBuckets = () => [
  { key: "todo", label: "Todo", color: "#111" },
  { key: "doing", label: "Doing", color: "#222" },
  { key: "done", label: "Done", color: "#333" },
];

const makeCard = (id: string, bucket: string, order = 0) => ({
  id,
  bucket,
  priority: "Média" as const,
  progress: "Não iniciado" as const,
  title: `Card ${id}`,
  desc: "",
  tags: [] as string[],
  direction: null,
  dueDate: null,
  order,
});

describe("useBoardDnd", () => {
  it("exposes sensors, collision detection, and null activeCard when idle", () => {
    const moveCardsBatch = vi.fn();
    const reorderColumns = vi.fn();
    const getCardsByBucket = () => [] as ReturnType<typeof makeCard>[];

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

  it("moves card when dropping on bucket-prefixed droppable (empty column)", () => {
    const moveCardsBatch = vi.fn();
    const reorderColumns = vi.fn();
    const cards = [makeCard("C1", "todo")];
    const getCardsByBucket = (key: string) => cards.filter((c) => c.bucket === key);

    const { result } = renderHook(() =>
      useBoardDnd({
        buckets: makeBuckets(),
        cards,
        getCardsByBucket,
        moveCardsBatch,
        reorderColumns,
      })
    );

    act(() => {
      result.current.handleDragEnd({
        active: { id: "card-C1", data: { current: { dragIds: ["C1"] } } },
        over: { id: "bucket-doing" },
      } as never);
    });

    expect(moveCardsBatch).toHaveBeenCalledWith(["C1"], "doing", 0);
    expect(reorderColumns).not.toHaveBeenCalled();
  });

  it("moves card when dropping on plain bucket key (column sortable id)", () => {
    const moveCardsBatch = vi.fn();
    const reorderColumns = vi.fn();
    const cards = [makeCard("C1", "todo"), makeCard("C2", "doing")];
    const getCardsByBucket = (key: string) => cards.filter((c) => c.bucket === key);

    const { result } = renderHook(() =>
      useBoardDnd({
        buckets: makeBuckets(),
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
    expect(reorderColumns).not.toHaveBeenCalled();
  });

  it("moves card when dropping over another card in different column", () => {
    const moveCardsBatch = vi.fn();
    const reorderColumns = vi.fn();
    const cards = [
      makeCard("C1", "todo", 0),
      makeCard("C2", "doing", 0),
      makeCard("C3", "doing", 1),
    ];
    const getCardsByBucket = (key: string) => cards.filter((c) => c.bucket === key);

    const { result } = renderHook(() =>
      useBoardDnd({
        buckets: makeBuckets(),
        cards,
        getCardsByBucket,
        moveCardsBatch,
        reorderColumns,
      })
    );

    act(() => {
      result.current.handleDragEnd({
        active: { id: "card-C1", data: { current: { dragIds: ["C1"] } } },
        over: { id: "card-C3" },
      } as never);
    });

    expect(moveCardsBatch).toHaveBeenCalledWith(["C1"], "doing", 1);
  });

  it("moves card when dropping on a slot in another column", () => {
    const moveCardsBatch = vi.fn();
    const reorderColumns = vi.fn();
    const cards = [makeCard("C1", "todo"), makeCard("C2", "doing")];
    const getCardsByBucket = (key: string) => cards.filter((c) => c.bucket === key);

    const { result } = renderHook(() =>
      useBoardDnd({
        buckets: makeBuckets(),
        cards,
        getCardsByBucket,
        moveCardsBatch,
        reorderColumns,
      })
    );

    act(() => {
      result.current.handleDragEnd({
        active: { id: "card-C1", data: { current: { dragIds: ["C1"] } } },
        over: { id: "slot-doing-0" },
      } as never);
    });

    expect(moveCardsBatch).toHaveBeenCalledWith(["C1"], "doing", 0);
  });

  it("does NOT trigger column reorder when dragging a card over a column key", () => {
    const moveCardsBatch = vi.fn();
    const reorderColumns = vi.fn();
    const cards = [makeCard("C1", "todo")];
    const getCardsByBucket = (key: string) => cards.filter((c) => c.bucket === key);

    const { result } = renderHook(() =>
      useBoardDnd({
        buckets: makeBuckets(),
        cards,
        getCardsByBucket,
        moveCardsBatch,
        reorderColumns,
      })
    );

    act(() => {
      result.current.handleDragEnd({
        active: { id: "card-C1", data: { current: { dragIds: ["C1"] } } },
        over: { id: "done" },
      } as never);
    });

    expect(reorderColumns).not.toHaveBeenCalled();
    expect(moveCardsBatch).toHaveBeenCalledWith(["C1"], "done", 0);
  });

  it("reorders columns when dragging a column over another column", () => {
    const moveCardsBatch = vi.fn();
    const reorderColumns = vi.fn();
    const getCardsByBucket = () => [] as ReturnType<typeof makeCard>[];

    const { result } = renderHook(() =>
      useBoardDnd({
        buckets: makeBuckets(),
        cards: [],
        getCardsByBucket,
        moveCardsBatch,
        reorderColumns,
      })
    );

    act(() => {
      result.current.handleDragEnd({
        active: { id: "todo", data: { current: {} } },
        over: { id: "doing" },
      } as never);
    });

    expect(reorderColumns).toHaveBeenCalledWith(0, 1);
    expect(moveCardsBatch).not.toHaveBeenCalled();
  });

  it("reorders columns with bucket-prefixed over id", () => {
    const moveCardsBatch = vi.fn();
    const reorderColumns = vi.fn();
    const getCardsByBucket = () => [] as ReturnType<typeof makeCard>[];

    const { result } = renderHook(() =>
      useBoardDnd({
        buckets: makeBuckets(),
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

  it("does nothing when dropping card on itself", () => {
    const moveCardsBatch = vi.fn();
    const reorderColumns = vi.fn();
    const cards = [makeCard("C1", "todo")];
    const getCardsByBucket = (key: string) => cards.filter((c) => c.bucket === key);

    const { result } = renderHook(() =>
      useBoardDnd({
        buckets: makeBuckets(),
        cards,
        getCardsByBucket,
        moveCardsBatch,
        reorderColumns,
      })
    );

    act(() => {
      result.current.handleDragEnd({
        active: { id: "card-C1", data: { current: { dragIds: ["C1"] } } },
        over: { id: "card-C1" },
      } as never);
    });

    expect(moveCardsBatch).not.toHaveBeenCalled();
  });
});
