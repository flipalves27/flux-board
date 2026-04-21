"use client";

import { create } from "zustand";
import { devtools } from "zustand/middleware";

const LS_KEY = "flux:board-fluxy-dock-visible";

function readLs(): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(LS_KEY);
    if (v === "0") return false;
    if (v === "1") return true;
    return null;
  } catch {
    return null;
  }
}

function writeLs(visible: boolean) {
  try {
    localStorage.setItem(LS_KEY, visible ? "1" : "0");
  } catch {
    // ignore
  }
}

type FluxyBoardDockState = {
  dockVisible: boolean;
  hydrated: boolean;
  setDockVisible: (visible: boolean) => void;
  toggleDockVisible: () => void;
  hydrateFromStorage: () => void;
};

const devEnabled = process.env.NODE_ENV === "development";

export const useFluxyBoardDockStore = create<FluxyBoardDockState>()(
  devtools(
    (set, get) => ({
      dockVisible: true,
      hydrated: false,
      hydrateFromStorage: () => {
        const fromLs = readLs();
        set({
          dockVisible: fromLs ?? true,
          hydrated: true,
        });
      },
      setDockVisible: (dockVisible) => {
        set({ dockVisible });
        writeLs(dockVisible);
      },
      toggleDockVisible: () => {
        const next = !get().dockVisible;
        get().setDockVisible(next);
      },
    }),
    { name: "FluxyBoardDock", enabled: devEnabled }
  )
);
