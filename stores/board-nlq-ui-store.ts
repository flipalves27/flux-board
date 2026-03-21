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

export type NlqLlmMeta = { model?: string; provider?: string };

type BoardNlqUiState = {
  allowedIdsByBoard: Record<string, string[]>;
  metricByBoard: Record<string, BoardNlqMetricSnapshot>;
  /** Última consulta NLQ com metadados de modelo (Together quando aplicável). */
  nlqLlmMetaByBoard: Record<string, NlqLlmMeta | undefined>;
  setBoardNlqCards: (boardId: string, ids: string[] | null) => void;
  setBoardNlqMetric: (boardId: string, snapshot: BoardNlqMetricSnapshot | null) => void;
  setNlqLlmMeta: (boardId: string, meta: NlqLlmMeta | null) => void;
  clearBoardNlq: (boardId: string) => void;
};

const devEnabled = process.env.NODE_ENV === "development";

export const useBoardNlqUiStore = create<BoardNlqUiState>()(
  devtools(
    (set) => ({
      allowedIdsByBoard: {},
      metricByBoard: {},
      nlqLlmMetaByBoard: {},
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
      setNlqLlmMeta: (boardId, meta) =>
        set((s) => {
          const nlqLlmMetaByBoard = { ...s.nlqLlmMetaByBoard };
          if (meta == null) delete nlqLlmMetaByBoard[boardId];
          else nlqLlmMetaByBoard[boardId] = meta;
          return { nlqLlmMetaByBoard };
        }),
      clearBoardNlq: (boardId) =>
        set((s) => {
          const allowedIdsByBoard = { ...s.allowedIdsByBoard };
          const metricByBoard = { ...s.metricByBoard };
          const nlqLlmMetaByBoard = { ...s.nlqLlmMetaByBoard };
          delete allowedIdsByBoard[boardId];
          delete metricByBoard[boardId];
          delete nlqLlmMetaByBoard[boardId];
          return { allowedIdsByBoard, metricByBoard, nlqLlmMetaByBoard };
        }),
    }),
    { name: "FluxBoardNlq", enabled: devEnabled }
  )
);
