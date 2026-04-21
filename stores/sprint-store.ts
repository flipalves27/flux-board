import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { SprintData } from "@/lib/schemas";

interface SprintState {
  sprintsByBoard: Record<string, SprintData[]>;
  activeSprint: Record<string, SprintData | null>;
  panelOpenBoard: string | null;
  loadingBoard: Record<string, boolean>;
  error: string | null;

  setPanelOpen: (boardId: string | null) => void;
  setLoadingBoard: (boardId: string, loading: boolean) => void;
  setSprints: (boardId: string, sprints: SprintData[]) => void;
  setActiveSprint: (boardId: string, sprint: SprintData | null) => void;
  upsertSprint: (boardId: string, sprint: SprintData) => void;
  removeSprint: (boardId: string, sprintId: string) => void;
  setError: (err: string | null) => void;
}

export const useSprintStore = create<SprintState>()(
  devtools(
    (set) => ({
      sprintsByBoard: {},
      activeSprint: {},
      panelOpenBoard: null,
      loadingBoard: {},
      error: null,

      setPanelOpen: (boardId) => set({ panelOpenBoard: boardId }),

      setLoadingBoard: (boardId, loading) =>
        set((state) => ({ loadingBoard: { ...state.loadingBoard, [boardId]: loading } })),

      setSprints: (boardId, sprints) =>
        set((state) => ({ sprintsByBoard: { ...state.sprintsByBoard, [boardId]: sprints } })),

      setActiveSprint: (boardId, sprint) =>
        set((state) => ({ activeSprint: { ...state.activeSprint, [boardId]: sprint } })),

      upsertSprint: (boardId, sprint) =>
        set((state) => {
          const existing = state.sprintsByBoard[boardId] ?? [];
          const idx = existing.findIndex((s) => s.id === sprint.id);
          const updated = idx >= 0 ? existing.map((s) => (s.id === sprint.id ? sprint : s)) : [sprint, ...existing];
          const prevActive = state.activeSprint[boardId] ?? null;
          let nextActive = prevActive;
          if (sprint.status === "active") nextActive = sprint;
          else if (prevActive?.id === sprint.id) nextActive = null;
          return {
            sprintsByBoard: { ...state.sprintsByBoard, [boardId]: updated },
            activeSprint: { ...state.activeSprint, [boardId]: nextActive },
          };
        }),

      removeSprint: (boardId, sprintId) =>
        set((state) => {
          const existing = state.sprintsByBoard[boardId] ?? [];
          const updated = existing.filter((s) => s.id !== sprintId);
          const currActive = state.activeSprint[boardId];
          return {
            sprintsByBoard: { ...state.sprintsByBoard, [boardId]: updated },
            activeSprint: {
              ...state.activeSprint,
              [boardId]: currActive?.id === sprintId ? null : currActive ?? null,
            },
          };
        }),

      setError: (err) => set({ error: err }),
    }),
    { name: "sprint-store" }
  )
);
