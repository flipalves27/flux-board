"use client";

import { create } from "zustand";
import { devtools } from "zustand/middleware";

const LS_KEY = "flux:workspace-fluxy-dock-visible";

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

export type WorkspaceFluxySprintContext = { boardId: string; sprintId: string };

type WorkspaceFluxyDockState = {
  dockVisible: boolean;
  hydrated: boolean;
  /** Quando definido, o POST do fluxy-chat envia boardId/sprintId para contexto da sprint. */
  sprintContext: WorkspaceFluxySprintContext | null;
  setDockVisible: (visible: boolean) => void;
  setSprintContext: (ctx: WorkspaceFluxySprintContext | null) => void;
  hydrateFromStorage: () => void;
};

const devEnabled = process.env.NODE_ENV === "development";

export const useWorkspaceFluxyDockStore = create<WorkspaceFluxyDockState>()(
  devtools(
    (set) => ({
      dockVisible: true,
      hydrated: false,
      sprintContext: null,
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
      setSprintContext: (sprintContext) => set({ sprintContext }),
    }),
    { name: "WorkspaceFluxyDock", enabled: devEnabled }
  )
);
