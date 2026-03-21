"use client";

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import type { BoardData } from "@/app/board/[id]/page";

export type BoardUpdateRecipe = (draft: BoardData) => void;

/** Module-level ref to debounce-persist the board. */
let persistBoard: (() => void) | null = null;

/** Registered by the board page to debounce-save after local mutations. */
export function setBoardPersistenceHandler(fn: (() => void) | null) {
  persistBoard = fn;
}

export function callBoardPersist() {
  persistBoard?.();
}

/* ── CSV bridge (module-level refs so page-level components can trigger board CSV actions) ── */

let _csvExportFn: (() => void) | null = null;
let _csvImportInputEl: HTMLInputElement | null = null;

export function registerCsvExportHandler(fn: (() => void) | null) {
  _csvExportFn = fn;
}

export function registerCsvImportInput(el: HTMLInputElement | null) {
  _csvImportInputEl = el;
}

export function triggerCsvExport() {
  _csvExportFn?.();
}

export function triggerCsvImport() {
  _csvImportInputEl?.click();
}

type BoardStoreState = {
  boardId: string | null;
  db: BoardData | null;
  hydrate: (boardId: string, data: BoardData) => void;
  reset: () => void;
  /** Local edits — triggers optional persist handler. */
  updateDb: (recipe: BoardUpdateRecipe) => void;
  /** Server echo / portal — no persist. */
  updateDbSilent: (recipe: BoardUpdateRecipe) => void;
};

const devEnabled = process.env.NODE_ENV === "development";

export const useBoardStore = create<BoardStoreState>()(
  devtools(
    immer((set) => ({
      boardId: null,
      db: null,
      hydrate: (boardId, data) =>
        set((s) => {
          s.boardId = boardId;
          s.db = data;
        }),
      reset: () =>
        set((s) => {
          s.boardId = null;
          s.db = null;
        }),
      updateDb: (recipe) => {
        set((s) => {
          if (!s.db) return;
          recipe(s.db);
        });
        persistBoard?.();
      },
      updateDbSilent: (recipe) =>
        set((s) => {
          if (!s.db) return;
          recipe(s.db);
        }),
    })),
    { name: "FluxBoard", enabled: devEnabled }
  )
);
