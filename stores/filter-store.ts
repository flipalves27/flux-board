"use client";

import { create } from "zustand";
import { createJSONStorage, devtools, persist } from "zustand/middleware";

export type BoardFiltersSlice = {
  activePrio: string;
  activeLabels: string[];
  searchQuery: string;
  /** Foco vindo dos chips de inteligência (interseção com filtros normais). */
  insightFocusCardIds: string[];
};

const DEFAULT_FILTERS: BoardFiltersSlice = {
  activePrio: "all",
  activeLabels: [],
  searchQuery: "",
  insightFocusCardIds: [],
};

const SESSION_KEY = "flux.kanban.filters.session.v1";

type FilterStoreState = {
  filtersByBoard: Record<string, BoardFiltersSlice>;
  patchFilters: (boardId: string, partial: Partial<BoardFiltersSlice>) => void;
  getFilters: (boardId: string) => BoardFiltersSlice;
};

const devEnabled = process.env.NODE_ENV === "development";

export const useFilterStore = create<FilterStoreState>()(
  devtools(
    persist(
      (set, get) => ({
        filtersByBoard: {},
        getFilters: (boardId) => {
          const cur = get().filtersByBoard[boardId];
          if (!cur) return { ...DEFAULT_FILTERS };
          return {
            ...DEFAULT_FILTERS,
            ...cur,
            insightFocusCardIds: Array.isArray(cur.insightFocusCardIds) ? cur.insightFocusCardIds : [],
          };
        },
        patchFilters: (boardId, partial) =>
          set((s) => {
            const cur = s.filtersByBoard[boardId] ?? { ...DEFAULT_FILTERS };
            const base = { ...DEFAULT_FILTERS, ...cur };
            const merged = { ...base, ...partial };
            if (!Array.isArray(merged.insightFocusCardIds)) merged.insightFocusCardIds = [];
            return {
              filtersByBoard: { ...s.filtersByBoard, [boardId]: merged },
            };
          }),
      }),
      {
        name: SESSION_KEY,
        storage: createJSONStorage(() => (typeof window !== "undefined" ? sessionStorage : noopStorage)),
        partialize: (s) => ({ filtersByBoard: s.filtersByBoard }),
        skipHydration: true,
      }
    ),
    { name: "FluxFilters", enabled: devEnabled }
  )
);

const noopStorage: Storage = {
  get length() {
    return 0;
  },
  clear() {},
  getItem: () => null,
  key: () => null,
  removeItem() {},
  setItem() {},
};
