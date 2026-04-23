"use client";

import { create } from "zustand";
import { createJSONStorage, devtools, persist } from "zustand/middleware";
import type { CardData } from "@/app/board/[id]/page";
import {
  BOARD_VIEW_STORAGE_PREFIX,
  isBoardViewMode,
  type BoardViewMode,
} from "@/components/kanban/kanban-constants";

export type ConfirmDeleteState =
  | { type: "card" | "bucket"; id: string; label: string }
  | { type: "cardsBatch"; ids: string[] }
  | null;

export type CsvImportConfirmState = {
  count: number;
  cards: CardData[];
  mode: "replace" | "merge";
  sameIdCount: number;
} | null;

type KanbanUiState = {
  boardViewByBoard: Record<string, BoardViewMode>;
  setBoardView: (boardId: string, view: BoardViewMode) => void;
  getBoardView: (boardId: string) => BoardViewMode;

  modalCard: CardData | null;
  modalMode: "new" | "edit";
  setModalCard: (v: CardData | null) => void;
  setModalMode: (v: "new" | "edit") => void;

  mapaOpen: boolean;
  setMapaOpen: (v: boolean) => void;

  confirmDelete: ConfirmDeleteState;
  setConfirmDelete: (v: ConfirmDeleteState) => void;

  addColumnOpen: boolean;
  setAddColumnOpen: (v: boolean) => void;
  newColumnName: string;
  setNewColumnName: (v: string) => void;
  editingColumnKey: string | null;
  setEditingColumnKey: (v: string | null) => void;

  descModalCard: CardData | null;
  setDescModalCard: (v: CardData | null) => void;

  csvImportMode: "replace" | "merge";
  setCsvImportMode: (v: "replace" | "merge") => void;
  csvImportConfirm: CsvImportConfirmState;
  setCsvImportConfirm: (v: CsvImportConfirmState) => void;

  dailyOpen: boolean;
  setDailyOpen: (v: boolean) => void;

  resetForBoardSwitch: () => void;
};

const devEnabled = process.env.NODE_ENV === "development";

const VIEW_SESSION_KEY = "flux.board.viewMode.session.v1";

export const useKanbanUiStore = create<KanbanUiState>()(
  devtools(
    persist(
      (set, get) => ({
        boardViewByBoard: {},
        setBoardView: (boardId, view) =>
          set((s) => ({
            boardViewByBoard: { ...s.boardViewByBoard, [boardId]: view },
          })),
        getBoardView: (boardId) => {
          const v = get().boardViewByBoard[boardId] ?? "kanban";
          return isBoardViewMode(v) ? v : "kanban";
        },

        modalCard: null,
        modalMode: "new",
        setModalCard: (v) => set({ modalCard: v }),
        setModalMode: (v) => set({ modalMode: v }),

        mapaOpen: false,
        setMapaOpen: (v) => set({ mapaOpen: v }),

        confirmDelete: null,
        setConfirmDelete: (v) => set({ confirmDelete: v }),

        addColumnOpen: false,
        setAddColumnOpen: (v) => set({ addColumnOpen: v }),
        newColumnName: "",
        setNewColumnName: (v) => set({ newColumnName: v }),
        editingColumnKey: null,
        setEditingColumnKey: (v) => set({ editingColumnKey: v }),

        descModalCard: null,
        setDescModalCard: (v) => set({ descModalCard: v }),

        csvImportMode: "replace",
        setCsvImportMode: (v) => set({ csvImportMode: v }),
        csvImportConfirm: null,
        setCsvImportConfirm: (v) => set({ csvImportConfirm: v }),

        dailyOpen: false,
        setDailyOpen: (v) => set({ dailyOpen: v }),

        resetForBoardSwitch: () =>
          set({
            modalCard: null,
            modalMode: "new",
            mapaOpen: false,
            confirmDelete: null,
            addColumnOpen: false,
            newColumnName: "",
            editingColumnKey: null,
            descModalCard: null,
            csvImportConfirm: null,
            dailyOpen: false,
          }),
      }),
      {
        name: VIEW_SESSION_KEY,
        storage: createJSONStorage(() => (typeof window !== "undefined" ? localStorage : noopStorage)),
        partialize: (s) => ({ boardViewByBoard: s.boardViewByBoard }),
        /** Evita mismatch SSR/client ao ler localStorage antes da hidratação do React. */
        skipHydration: true,
      }
    ),
    { name: "FluxKanbanUi", enabled: devEnabled }
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

/** One-time migration from per-board localStorage keys (pre–Zustand). */
export function migrateBoardViewFromLegacyLocalStorage(boardId: string) {
  if (typeof window === "undefined") return;
  try {
    const key = `${BOARD_VIEW_STORAGE_PREFIX}${boardId}`;
    const raw = window.localStorage.getItem(key);
    if (!raw || (raw !== "kanban" && raw !== "timeline" && raw !== "table" && raw !== "eisenhower")) return;
    const cur = useKanbanUiStore.getState().boardViewByBoard[boardId];
    if (cur) return;
    useKanbanUiStore.getState().setBoardView(boardId, raw);
  } catch {
    // ignore
  }
}
