import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBoardPersistence } from "./useBoardPersistence";
import { BOARD_VIEW_STORAGE_PREFIX, KANBAN_FILTERS_STORAGE_PREFIX } from "../kanban-constants";

describe("useBoardPersistence", () => {
  const boardId = "test-board-1";
  const viewKey = `${BOARD_VIEW_STORAGE_PREFIX}${boardId}`;
  const filterKey = `${KANBAN_FILTERS_STORAGE_PREFIX}${boardId}`;

  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      store: {} as Record<string, string>,
      getItem(k: string) {
        return this.store[k] ?? null;
      },
      setItem(k: string, v: string) {
        this.store[k] = v;
      },
      removeItem(k: string) {
        delete this.store[k];
      },
      clear() {
        this.store = {};
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hydrates board view and filters from localStorage on mount", () => {
    window.localStorage.setItem(viewKey, "timeline");
    window.localStorage.setItem(
      filterKey,
      JSON.stringify({
        activePrio: "Urgente",
        activeLabels: ["x"],
        searchQuery: "q",
      })
    );

    const { result } = renderHook(() => useBoardPersistence(boardId));

    expect(result.current.boardView).toBe("timeline");
    expect(result.current.activePrio).toBe("Urgente");
    expect(result.current.activeLabels.has("x")).toBe(true);
    expect(result.current.searchQuery).toBe("q");
  });

  it("persists filter changes to localStorage", () => {
    const { result } = renderHook(() => useBoardPersistence(boardId));

    act(() => {
      result.current.setSearchQuery("hello");
    });

    const raw = window.localStorage.getItem(filterKey);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.searchQuery).toBe("hello");
  });
});
