import { create } from "zustand";

export type ForgeActiveRunRef = {
  runId: string;
  boardId?: string | null;
  updatedAt: string;
  status?: string;
};

type ForgeActiveState = {
  active: ForgeActiveRunRef[];
  setActive: (runs: ForgeActiveRunRef[]) => void;
  clearRun: (runId: string) => void;
};

export const useForgeActiveStore = create<ForgeActiveState>((set) => ({
  active: [],
  setActive: (active) => set({ active }),
  clearRun: (runId) => set((s) => ({ active: s.active.filter((r) => r.runId !== runId) })),
}));
