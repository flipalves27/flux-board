"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/** Aurora: gradientes e profundidade (visão 1). Minimal: flat, acento lateral, sem sombras (visão 2). */
export type NavigationVariant = "aurora" | "minimal";

const STORAGE_KEY = "flux-board.navigation.variant";

type NavigationVariantContextValue = {
  variant: NavigationVariant;
  setVariant: (v: NavigationVariant) => void;
  toggleVariant: () => void;
};

const NavigationVariantContext = createContext<NavigationVariantContextValue | null>(null);

export function NavigationVariantProvider({ children }: { children: ReactNode }) {
  const [variant, setVariantState] = useState<NavigationVariant>("aurora");

  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === "minimal" || v === "aurora") setVariantState(v);
    } catch {
      /* ignore */
    }
  }, []);

  const setVariant = useCallback((v: NavigationVariant) => {
    setVariantState(v);
    try {
      localStorage.setItem(STORAGE_KEY, v);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleVariant = useCallback(() => {
    setVariantState((prev) => {
      const next: NavigationVariant = prev === "aurora" ? "minimal" : "aurora";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const value = useMemo<NavigationVariantContextValue>(
    () => ({ variant, setVariant, toggleVariant }),
    [variant, setVariant, toggleVariant],
  );

  return <NavigationVariantContext.Provider value={value}>{children}</NavigationVariantContext.Provider>;
}

export function useNavigationVariant(): NavigationVariant {
  const ctx = useContext(NavigationVariantContext);
  return ctx?.variant ?? "aurora";
}

export function useNavigationVariantActions(): NavigationVariantContextValue | null {
  return useContext(NavigationVariantContext);
}
