"use client";

import { createContext, useContext, useMemo } from "react";
import type { FluxyAvatarState } from "@/components/fluxy/fluxy-types";

type FluxySurface = "board" | "workspace" | "system";

export type FluxyPresenceState = {
  visualState: FluxyAvatarState;
  message: string | null;
  source: FluxySurface;
};

const defaultPresence: FluxyPresenceState = {
  visualState: "idle",
  message: null,
  source: "system",
};

const FluxyPresenceContext = createContext<FluxyPresenceState>(defaultPresence);

export type FluxyStateInput = {
  isGenerating?: boolean;
  isOpen?: boolean;
  isListening?: boolean;
  isWriting?: boolean;
  isWipViolated?: boolean;
  isCriticalDelay?: boolean;
  isAnomalyHigh?: boolean;
  isCelebrating?: boolean;
  isFirstOpen?: boolean;
  source?: FluxySurface;
  message?: string | null;
};

export function resolveFluxyVisualState(input?: FluxyStateInput): FluxyAvatarState {
  if (!input) return "waving";
  if (input.isListening || input.isWriting) return "talking";
  if (input.isWipViolated || input.isCriticalDelay || input.isAnomalyHigh) return "thinking";
  if (input.isCelebrating) return "celebrating";
  if (input.isGenerating) return "thinking";
  if (input.isOpen) return "talking";
  if (input.isFirstOpen) return "waving";
  return "waving";
}

export function FluxyPresenceProvider({ children }: { children: React.ReactNode }) {
  const value = useMemo<FluxyPresenceState>(() => defaultPresence, []);
  return <FluxyPresenceContext.Provider value={value}>{children}</FluxyPresenceContext.Provider>;
}

export function useFluxyState(input?: FluxyStateInput): FluxyPresenceState {
  const base = useContext(FluxyPresenceContext);
  const visualState = resolveFluxyVisualState(input);
  return {
    visualState,
    message: input?.message ?? base.message,
    source: input?.source ?? base.source,
  };
}

