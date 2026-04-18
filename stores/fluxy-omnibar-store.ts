"use client";

import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export type FluxyOmnibarHistoryEntry = { at: string; text: string; intent?: string };

type FluxyOmnibarStore = {
  history: FluxyOmnibarHistoryEntry[];
  pushHistory: (e: FluxyOmnibarHistoryEntry) => void;
  pendingSeed: string | null;
  setPendingSeed: (v: string | null) => void;
};

const devEnabled = process.env.NODE_ENV === "development";

export const useFluxyOmnibarStore = create<FluxyOmnibarStore>()(
  devtools(
    persist(
      (set) => ({
        history: [],
        pendingSeed: null,
        setPendingSeed: (pendingSeed) => set({ pendingSeed }),
        pushHistory: (e) =>
          set((s) => ({
            history: [e, ...s.history].slice(0, 40),
          })),
      }),
      {
        name: "flux-board.fluxy-omnibar",
        partialize: (s) => ({ history: s.history }),
      }
    ),
    { name: "FluxyOmnibar", enabled: devEnabled }
  )
);
