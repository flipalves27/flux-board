"use client";

import { create } from "zustand";
import { devtools } from "zustand/middleware";

export type BoardNlqMetricSnapshot = {
  headline: string;
  primaryValue: number;
  compareValue: number | null;
  chart: { label: string; value: number }[];
  explanation: string;
};

type BoardNlqUiState = {
  allowedIdsByBoard: Record<string, string[]>;
  metricByBoard: Record<string, BoardNlqMetricSnapshot>;
  setBoardNlqCards: (boardId: string, ids: string[] | null) => void;
  setBoardNlqMetric: (boardId: string, snapshot: BoardNlqMetricSnapshot | null) => void;
  clearBoardNlq: (boardId: string) => void;
};

const devEnabled = process.env.NODE_ENV === "development";

export const useBoardNlqUiStore = create<BoardNlqUiState>()(
  devtools(
    (set) => ({
      allowedIdsByBoard: {},
      metricByBoard: {},
      setBoardNlqCards: (boardId, ids) =>
        set((s) => {
          const allowedIdsByBoard = { ...s.allowedIdsByBoard };
          const metricByBoard = { ...s.metricByBoard };
          if (ids === null) {
            delete allowedIdsByBoard[boardId];
          } else {
            allowedIdsByBoard[boardId] = ids;
            delete metricByBoard[boardId];
          }
          return { allowedIdsByBoard, metricByBoard };
        }),
      setBoardNlqMetric: (boardId, snapshot) =>
        set((s) => {
          const allowedIdsByBoard = { ...s.allowedIdsByBoard };
          const metricByBoard = { ...s.metricByBoard };
          delete allowedIdsByBoard[boardId];
          if (snapshot) metricByBoard[boardId] = snapshot;
          else delete metricByBoard[boardId];
          return { allowedIdsByBoard, metricByBoard };
        }),
      clearBoardNlq: (boardId) =>
        set((s) => {
          const allowedIdsByBoard = { ...s.allowedIdsByBoard };
          const metricByBoard = { ...s.metricByBoard };
          delete allowedIdsByBoard[boardId];
          delete metricByBoard[boardId];
          return { allowedIdsByBoard, metricByBoard };
        }),
    }),
    { name: "FluxBoardNlq", enabled: devEnabled }
  )
);
