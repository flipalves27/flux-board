"use client";

import { create } from "zustand";

export type DockId = "fluxy" | "insights" | "activity" | "context";

type DocksState = {
  openDock: DockId | null;
  setOpenDock: (id: DockId | null) => void;
  toggleDock: (id: DockId) => void;
};

export const useDocksStore = create<DocksState>((set, get) => ({
  openDock: null,
  setOpenDock: (id) => set({ openDock: id }),
  toggleDock: (id) => set({ openDock: get().openDock === id ? null : id }),
}));
