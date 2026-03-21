"use client";

import { create } from "zustand";
import { createJSONStorage, devtools, persist } from "zustand/middleware";

export type BoardFiltersSlice = {
  activePrio: string;
  activeLabels: string[];
  searchQuery: string;
};

const DEFAULT_FILTERS: BoardFiltersSlice = {
  activePrio: "all",
  activeLabels: [],
  searchQuery: "",
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
        getFilters: (boardId) => get().filtersByBoard[boardId] ?? { ...DEFAULT_FILTERS },
        patchFilters: (boardId, partial) =>
          set((s) => {
            const cur = s.filtersByBoard[boardId] ?? { ...DEFAULT_FILTERS };
            return {
              filtersByBoard: { ...s.filtersByBoard, [boardId]: { ...cur, ...partial } },
            };
          }),
      }),
      {
        name: SESSION_KEY,
        storage: createJSONStorage(() => (typeof window !== "undefined" ? sessionStorage : noopStorage)),
        partialize: (s) => ({ filtersByBoard: s.filtersByBoard }),
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
