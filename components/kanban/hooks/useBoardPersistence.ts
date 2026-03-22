import { useCallback, useEffect, useMemo, type Dispatch, type SetStateAction } from "react";
import { KANBAN_FILTERS_STORAGE_PREFIX, type BoardViewMode } from "../kanban-constants";
import { useFilterStore, type BoardFiltersSlice } from "@/stores/filter-store";
import { migrateBoardViewFromLegacyLocalStorage, useKanbanUiStore } from "@/stores/ui-store";

export type SavedKanbanFilters = BoardFiltersSlice;

const EMPTY_LABELS: string[] = [];

export function useBoardPersistence(boardId: string) {
  const filtersStorageKey = `${KANBAN_FILTERS_STORAGE_PREFIX}${boardId}`;
  const viewStorageKey = `flux.board.viewMode.session.v1::${boardId}`;

  /** Hidrata stores persistidos só no cliente (skipHydration), alinhando SSR ao primeiro paint. */
  useEffect(() => {
    void useKanbanUiStore.persist.rehydrate();
    void useFilterStore.persist.rehydrate();
  }, []);

  useEffect(() => {
    migrateBoardViewFromLegacyLocalStorage(boardId);
  }, [boardId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const legacyKey = `${KANBAN_FILTERS_STORAGE_PREFIX}${boardId}`;
    const raw = window.localStorage.getItem(legacyKey);
    if (!raw) return;
    const f = useFilterStore.getState().filtersByBoard[boardId];
    const hasCustom =
      f &&
      (f.activePrio !== "all" || f.activeLabels.length > 0 || (f.searchQuery && f.searchQuery.length > 0));
    if (hasCustom) return;
    try {
      const parsed = JSON.parse(raw) as Partial<SavedKanbanFilters>;
      useFilterStore.getState().patchFilters(boardId, {
        activePrio: typeof parsed.activePrio === "string" ? parsed.activePrio : "all",
        activeLabels: Array.isArray(parsed.activeLabels)
          ? parsed.activeLabels.filter((item): item is string => typeof item === "string")
          : [],
        searchQuery: typeof parsed.searchQuery === "string" ? parsed.searchQuery : "",
      });
    } catch {
      // ignore
    }
  }, [boardId]);

  const activePrio = useFilterStore((s) => s.filtersByBoard[boardId]?.activePrio ?? "all");
  const activeLabelsArr = useFilterStore((s) => s.filtersByBoard[boardId]?.activeLabels ?? EMPTY_LABELS);
  const searchQuery = useFilterStore((s) => s.filtersByBoard[boardId]?.searchQuery ?? "");
  const insightFocusCardIdsArr = useFilterStore((s) => s.getFilters(boardId).insightFocusCardIds);

  const boardView = useKanbanUiStore((s) => s.getBoardView(boardId));

  const setBoardView = useCallback(
    (v: SetStateAction<BoardViewMode>) => {
      const cur = useKanbanUiStore.getState().getBoardView(boardId);
      const next = typeof v === "function" ? v(cur) : v;
      useKanbanUiStore.getState().setBoardView(boardId, next);
    },
    [boardId]
  );

  const setActivePrio = useCallback(
    (v: SetStateAction<string>) => {
      const cur = useFilterStore.getState().filtersByBoard[boardId]?.activePrio ?? "all";
      const next = typeof v === "function" ? v(cur) : v;
      useFilterStore.getState().patchFilters(boardId, { activePrio: next });
    },
    [boardId]
  );

  const setActiveLabels = useCallback(
    (v: SetStateAction<Set<string>>) => {
      const curArr = useFilterStore.getState().filtersByBoard[boardId]?.activeLabels ?? [];
      const cur = new Set(curArr);
      const next = typeof v === "function" ? v(cur) : v;
      useFilterStore.getState().patchFilters(boardId, { activeLabels: [...next] });
    },
    [boardId]
  );

  const setSearchQuery = useCallback(
    (v: SetStateAction<string>) => {
      const cur = useFilterStore.getState().filtersByBoard[boardId]?.searchQuery ?? "";
      const next = typeof v === "function" ? v(cur) : v;
      useFilterStore.getState().patchFilters(boardId, { searchQuery: next });
    },
    [boardId]
  );

  const setInsightFocusCardIds = useCallback(
    (ids: string[]) => {
      useFilterStore.getState().patchFilters(boardId, { insightFocusCardIds: [...new Set(ids.filter(Boolean))] });
    },
    [boardId]
  );

  const clearInsightFocus = useCallback(() => {
    useFilterStore.getState().patchFilters(boardId, { insightFocusCardIds: [] });
  }, [boardId]);

  const activeLabels = useMemo(() => new Set(activeLabelsArr), [activeLabelsArr]);
  const insightFocusCardIds = useMemo(() => new Set(insightFocusCardIdsArr), [insightFocusCardIdsArr]);

  return {
    boardView,
    setBoardView: setBoardView as Dispatch<SetStateAction<BoardViewMode>>,
    activePrio,
    setActivePrio,
    activeLabels,
    setActiveLabels,
    searchQuery,
    setSearchQuery,
    insightFocusCardIds,
    setInsightFocusCardIds,
    clearInsightFocus,
    filtersStorageKey,
    viewStorageKey,
  };
}
