"use client";

import { create } from "zustand";
import { devtools } from "zustand/middleware";

type BoardExecutionInsightsStoreState = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
};

const devEnabled = process.env.NODE_ENV === "development";

export const useBoardExecutionInsightsStore = create<BoardExecutionInsightsStoreState>()(
  devtools(
    (set) => ({
      open: false,
      setOpen: (open) => set({ open }),
      toggleOpen: () => set((s) => ({ open: !s.open })),
    }),
    { name: "FluxBoardExecutionInsights", enabled: devEnabled }
  )
);
