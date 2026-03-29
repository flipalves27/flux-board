"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";

/** Estilo único da navegação: flat, acento lateral (anteriormente “Clean” / minimal). */
export type NavigationVariant = "minimal";

type NavigationVariantContextValue = {
  variant: NavigationVariant;
  setVariant: (v: NavigationVariant) => void;
  toggleVariant: () => void;
};

const NavigationVariantContext = createContext<NavigationVariantContextValue | null>(null);

const ignoreVariant = (_v: NavigationVariant) => {};
const ignoreToggle = () => {};

export function NavigationVariantProvider({ children }: { children: ReactNode }) {
  const value = useMemo<NavigationVariantContextValue>(
    () => ({ variant: "minimal", setVariant: ignoreVariant, toggleVariant: ignoreToggle }),
    [],
  );

  return <NavigationVariantContext.Provider value={value}>{children}</NavigationVariantContext.Provider>;
}

export function useNavigationVariant(): NavigationVariant {
  const ctx = useContext(NavigationVariantContext);
  return ctx?.variant ?? "minimal";
}

export function useNavigationVariantActions(): NavigationVariantContextValue | null {
  return useContext(NavigationVariantContext);
}
