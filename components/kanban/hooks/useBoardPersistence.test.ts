import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBoardPersistence } from "./useBoardPersistence";
import { BOARD_VIEW_STORAGE_PREFIX, KANBAN_FILTERS_STORAGE_PREFIX } from "../kanban-constants";
import { useFilterStore } from "@/stores/filter-store";
import { useKanbanUiStore } from "@/stores/ui-store";

describe("useBoardPersistence", () => {
  const boardId = "test-board-1";
  const legacyFilterKey = `${KANBAN_FILTERS_STORAGE_PREFIX}${boardId}`;
  const legacyViewKey = `${BOARD_VIEW_STORAGE_PREFIX}${boardId}`;

  beforeEach(() => {
    useFilterStore.setState({ filtersByBoard: {} });
    useKanbanUiStore.setState({
      boardViewByBoard: {},
      modalCard: null,
      modalMode: "new",
      mapaOpen: false,
      confirmDelete: null,
      addColumnOpen: false,
      newColumnName: "",
      editingColumnKey: null,
      descModalCard: null,
      csvImportMode: "replace",
      csvImportConfirm: null,
      dailyOpen: false,
    });

    const memLocal: Record<string, string> = {};
    const memSession: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem(k: string) {
        return memLocal[k] ?? null;
      },
      setItem(k: string, v: string) {
        memLocal[k] = v;
      },
      removeItem(k: string) {
        delete memLocal[k];
      },
      clear() {
        Object.keys(memLocal).forEach((k) => delete memLocal[k]);
      },
      length: 0,
      key: () => null,
    } as Storage);

    vi.stubGlobal("sessionStorage", {
      getItem(k: string) {
        return memSession[k] ?? null;
      },
      setItem(k: string, v: string) {
        memSession[k] = v;
      },
      removeItem(k: string) {
        delete memSession[k];
      },
      clear() {
        Object.keys(memSession).forEach((k) => delete memSession[k]);
      },
      length: 0,
      key: () => null,
    } as Storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hydrates board view from legacy localStorage and filters from legacy localStorage into session-backed store", () => {
    window.localStorage.setItem(legacyViewKey, "timeline");
    window.localStorage.setItem(
      legacyFilterKey,
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

  it("updates filter slice in store when search query changes", async () => {
    const { result } = renderHook(() => useBoardPersistence(boardId));

    await act(async () => {
      result.current.setSearchQuery("hello");
    });

    expect(useFilterStore.getState().filtersByBoard[boardId]?.searchQuery).toBe("hello");
  });
});
