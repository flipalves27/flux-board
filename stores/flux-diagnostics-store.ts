"use client";

import { create } from "zustand";

export type FluxDiagEntry = {
  id: string;
  at: string;
  kind: "react-boundary" | "window" | "unhandledrejection" | "console";
  message: string;
  stack?: string;
  componentStack?: string;
  extra?: string;
};

const MAX = 80;

type FluxDiagnosticsState = {
  entries: FluxDiagEntry[];
  push: (partial: Omit<FluxDiagEntry, "id" | "at">) => void;
  clear: () => void;
};

export const useFluxDiagnosticsStore = create<FluxDiagnosticsState>((set) => ({
  entries: [],
  push: (partial) => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `e_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const entry: FluxDiagEntry = {
      ...partial,
      id,
      at: new Date().toISOString(),
    };
    set((s) => ({ entries: [entry, ...s.entries].slice(0, MAX) }));
  },
  clear: () => set({ entries: [] }),
}));

/** Acesso via DevTools: `window.__FLUX_DIAG__.dump()` */
export function exposeFluxDiagnosticsOnWindow() {
  if (typeof window === "undefined") return;
  (window as unknown as { __FLUX_DIAG__?: Record<string, unknown> }).__FLUX_DIAG__ = {
    dump: () => useFluxDiagnosticsStore.getState().entries,
    clear: () => useFluxDiagnosticsStore.getState().clear(),
    version: 1,
  };
}
