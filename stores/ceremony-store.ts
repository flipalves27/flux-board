import { create } from "zustand";
import { devtools } from "zustand/middleware";

export type CeremonyType = "retrospective" | "review" | "planning" | "standup";

interface CeremonyState {
  retroModalOpen: boolean;
  retroSprintId: string | null;
  retroBoardId: string | null;
  reviewModalOpen: boolean;
  reviewSprintId: string | null;
  reviewBoardId: string | null;
  planningModalOpen: boolean;
  planningSprintId: string | null;
  planningBoardId: string | null;
  standupModalOpen: boolean;
  standupSprintId: string | null;
  standupBoardId: string | null;
  currentCeremonyType: CeremonyType | null;

  openRetro: (boardId: string, sprintId: string) => void;
  closeRetro: () => void;
  openReview: (boardId: string, sprintId: string) => void;
  closeReview: () => void;
  openPlanning: (boardId: string, sprintId: string) => void;
  closePlanning: () => void;
  openStandup: (boardId: string, sprintId: string) => void;
  closeStandup: () => void;
}

export const useCeremonyStore = create<CeremonyState>()(
  devtools(
    (set) => ({
      retroModalOpen: false,
      retroSprintId: null,
      retroBoardId: null,
      reviewModalOpen: false,
      reviewSprintId: null,
      reviewBoardId: null,
      planningModalOpen: false,
      planningSprintId: null,
      planningBoardId: null,
      standupModalOpen: false,
      standupSprintId: null,
      standupBoardId: null,
      currentCeremonyType: null,

      openRetro: (boardId, sprintId) =>
        set({
          retroModalOpen: true,
          retroBoardId: boardId,
          retroSprintId: sprintId,
          currentCeremonyType: "retrospective",
        }),
      closeRetro: () => set({ retroModalOpen: false, retroSprintId: null, retroBoardId: null }),
      openReview: (boardId, sprintId) =>
        set({
          reviewModalOpen: true,
          reviewBoardId: boardId,
          reviewSprintId: sprintId,
          currentCeremonyType: "review",
        }),
      closeReview: () => set({ reviewModalOpen: false, reviewSprintId: null, reviewBoardId: null }),
      openPlanning: (boardId, sprintId) =>
        set({
          planningModalOpen: true,
          planningBoardId: boardId,
          planningSprintId: sprintId,
          currentCeremonyType: "planning",
        }),
      closePlanning: () => set({ planningModalOpen: false, planningSprintId: null, planningBoardId: null }),
      openStandup: (boardId, sprintId) =>
        set({
          standupModalOpen: true,
          standupBoardId: boardId,
          standupSprintId: sprintId,
          currentCeremonyType: "standup",
        }),
      closeStandup: () => set({ standupModalOpen: false, standupSprintId: null, standupBoardId: null }),
    }),
    { name: "ceremony-store" }
  )
);
