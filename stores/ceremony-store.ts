import { create } from "zustand";
import { devtools } from "zustand/middleware";

export type CeremonyType = "retrospective" | "review" | "planning" | "standup";

interface CeremonyState {
  retroModalOpen: boolean;
  retroSprintId: string | null;
  reviewModalOpen: boolean;
  reviewSprintId: string | null;
  currentCeremonyType: CeremonyType | null;

  openRetro: (sprintId: string) => void;
  closeRetro: () => void;
  openReview: (sprintId: string) => void;
  closeReview: () => void;
}

export const useCeremonyStore = create<CeremonyState>()(
  devtools(
    (set) => ({
      retroModalOpen: false,
      retroSprintId: null,
      reviewModalOpen: false,
      reviewSprintId: null,
      currentCeremonyType: null,

      openRetro: (sprintId) => set({ retroModalOpen: true, retroSprintId: sprintId, currentCeremonyType: "retrospective" }),
      closeRetro: () => set({ retroModalOpen: false, retroSprintId: null }),
      openReview: (sprintId) => set({ reviewModalOpen: true, reviewSprintId: sprintId, currentCeremonyType: "review" }),
      closeReview: () => set({ reviewModalOpen: false, reviewSprintId: null }),
    }),
    { name: "ceremony-store" }
  )
);
