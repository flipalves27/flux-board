import { create } from "zustand";

export type SpecPlanActiveRunRef = {
  runId: string;
  boardId: string;
  updatedAt: string;
  status?: string;
};

type SpecPlanActiveState = {
  active: SpecPlanActiveRunRef[];
  setActive: (runs: SpecPlanActiveRunRef[]) => void;
  clearRun: (runId: string) => void;
};

export const useSpecPlanActiveStore = create<SpecPlanActiveState>((set) => ({
  active: [],
  setActive: (active) => set({ active }),
  clearRun: (runId) => set((s) => ({ active: s.active.filter((r) => r.runId !== runId) })),
}));
