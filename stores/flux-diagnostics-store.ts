"use client";

import { create } from "zustand";
import { enrichDiagMessage, type DocLink } from "@/lib/diag-enrichment";
import { readAppVersion, readDiagClientContext } from "@/lib/diag-context-client";

export type FluxDiagSeverity = "error" | "warn" | "info";

export type FluxDiagEntry = {
  id: string;
  at: string;
  kind: "react-boundary" | "window" | "unhandledrejection" | "console" | "navigation";
  message: string;
  stack?: string;
  componentStack?: string;
  extra?: string;
  /** Caminho + query (ex.: /pt-BR/boards). */
  route?: string;
  href?: string;
  locale?: string;
  appVersion?: string;
  traceId?: string;
  /** Id do usuário (somente se opt-in no push). */
  userId?: string;
  userAgent?: string;
  severity?: FluxDiagSeverity;
  hints?: string[];
  docLinks?: DocLink[];
};

const MAX = 120;

type PushInput = Omit<FluxDiagEntry, "id" | "at"> & {
  /** Se false, não re-enriquecer hints (entrada já processada). */
  skipEnrich?: boolean;
};

type FluxDiagnosticsState = {
  entries: FluxDiagEntry[];
  /** Último traceId de sessão (para correlacionar eventos). */
  sessionTraceId: string;
  push: (partial: PushInput) => void;
  clear: () => void;
};

function newTraceId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `t_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function getOrCreateSessionTraceId(): string {
  if (typeof window === "undefined") return newTraceId();
  try {
    const key = "fluxDiagSessionTrace";
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const id = newTraceId();
    sessionStorage.setItem(key, id);
    return id;
  } catch {
    return newTraceId();
  }
}

export const useFluxDiagnosticsStore = create<FluxDiagnosticsState>((set, get) => ({
  entries: [],
  sessionTraceId: typeof window !== "undefined" ? getOrCreateSessionTraceId() : "",

  push: (partial) => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `e_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const ctx = readDiagClientContext();
    const sessionTraceId = get().sessionTraceId || getOrCreateSessionTraceId();
    if (!get().sessionTraceId) {
      set({ sessionTraceId });
    }

    const base: Omit<FluxDiagEntry, "id" | "at"> = {
      ...partial,
      route: partial.route ?? ctx.route ?? undefined,
      href: partial.href ?? ctx.href ?? undefined,
      locale: partial.locale ?? ctx.locale ?? undefined,
      appVersion: partial.appVersion ?? readAppVersion(),
      traceId: partial.traceId ?? sessionTraceId,
      userAgent: partial.userAgent ?? ctx.userAgent ?? undefined,
      severity: partial.severity ?? (partial.kind === "console" ? "warn" : partial.kind === "navigation" ? "info" : "error"),
    };

    let hints = partial.hints;
    let docLinks = partial.docLinks;
    if (!partial.skipEnrich) {
      const enriched = enrichDiagMessage(base.message, base.stack);
      hints = [...new Set([...(partial.hints ?? []), ...enriched.hints])];
      const mergedDocs = [...(partial.docLinks ?? []), ...enriched.docLinks];
      const seenUrls = new Set<string>();
      docLinks = mergedDocs.filter((l) => {
        if (seenUrls.has(l.url)) return false;
        seenUrls.add(l.url);
        return true;
      });
    }

    const entry: FluxDiagEntry = {
      ...base,
      hints: hints?.length ? hints : undefined,
      docLinks: docLinks?.length ? docLinks : undefined,
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
    version: 2,
  };
}
