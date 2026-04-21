"use client";

import { create } from "zustand";
import { devtools } from "zustand/middleware";

export type CopilotTier = "free" | "pro" | "business";

export type CopilotMessage = {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  createdAt: string;
  meta?: Record<string, unknown>;
};

export type FluxyBoardDockIntent = {
  expandSala: boolean;
  contextCardId: string | null;
  highlightMessageId: string | null;
  focusComposer: boolean;
};

type CopilotStoreState = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;

  fluxyBoardDock: FluxyBoardDockIntent | null;
  setFluxyBoardDock: (v: FluxyBoardDockIntent | null) => void;
  consumeFluxyBoardDock: () => FluxyBoardDockIntent | null;

  loadingHistory: boolean;
  setLoadingHistory: (v: boolean) => void;

  generating: boolean;
  setGenerating: (v: boolean) => void;

  tier: CopilotTier | null;
  setTier: (v: CopilotTier | null) => void;

  freeDemoRemaining: number | null;
  setFreeDemoRemaining: (v: number | null | ((prev: number | null) => number | null)) => void;

  messages: CopilotMessage[];
  setMessages: (v: CopilotMessage[] | ((prev: CopilotMessage[]) => CopilotMessage[])) => void;

  draft: string;
  setDraft: (v: string) => void;

  voiceListening: boolean;
  setVoiceListening: (v: boolean) => void;

  voiceInterim: string;
  setVoiceInterim: (v: string) => void;

  voiceError: string | null;
  setVoiceError: (v: string | null) => void;

  resetSessionUi: () => void;
};

const devEnabled = process.env.NODE_ENV === "development";

export const useCopilotStore = create<CopilotStoreState>()(
  devtools(
    (set, get) => ({
      open: false,
      setOpen: (open) => set({ open }),
      toggleOpen: () => set((s) => ({ open: !s.open })),

      fluxyBoardDock: null,
      setFluxyBoardDock: (v) => set({ fluxyBoardDock: v }),
      consumeFluxyBoardDock: () => {
        const cur = get().fluxyBoardDock;
        set({ fluxyBoardDock: null });
        return cur;
      },

      loadingHistory: false,
      setLoadingHistory: (loadingHistory) => set({ loadingHistory }),

      generating: false,
      setGenerating: (generating) => set({ generating }),

      tier: null,
      setTier: (tier) => set({ tier }),

      freeDemoRemaining: null,
      setFreeDemoRemaining: (v) =>
        set((s) => ({
          freeDemoRemaining: typeof v === "function" ? v(s.freeDemoRemaining) : v,
        })),

      messages: [],
      setMessages: (v) => set((s) => ({ messages: typeof v === "function" ? v(s.messages) : v })),

      draft: "",
      setDraft: (draft) => set({ draft }),

      voiceListening: false,
      setVoiceListening: (voiceListening) => set({ voiceListening }),

      voiceInterim: "",
      setVoiceInterim: (voiceInterim) => set({ voiceInterim }),

      voiceError: null,
      setVoiceError: (voiceError) => set({ voiceError }),

      resetSessionUi: () =>
        set({
          open: false,
          loadingHistory: false,
          generating: false,
          tier: null,
          freeDemoRemaining: null,
          messages: [],
          draft: "",
          voiceListening: false,
          voiceInterim: "",
          voiceError: null,
          fluxyBoardDock: null,
        }),
    }),
    { name: "FluxCopilot", enabled: devEnabled }
  )
);
