"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type SidebarLayoutMode = "mobile" | "tablet" | "desktop";

type SidebarLayoutContextValue = {
  layout: SidebarLayoutMode;
  mobileOpen: boolean;
  openMobile: () => void;
  closeMobile: () => void;
  toggleMobile: () => void;
};

const SidebarLayoutContext = createContext<SidebarLayoutContextValue | null>(null);

function resolveLayout(): SidebarLayoutMode {
  if (typeof window === "undefined") return "desktop";
  if (window.matchMedia("(max-width: 767px)").matches) return "mobile";
  if (window.matchMedia("(min-width: 1024px)").matches) return "desktop";
  return "tablet";
}

export function SidebarLayoutProvider({ children }: { children: ReactNode }) {
  const [layout, setLayout] = useState<SidebarLayoutMode>("desktop");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setLayout(resolveLayout());
    const mobileMq = window.matchMedia("(max-width: 767px)");
    const desktopMq = window.matchMedia("(min-width: 1024px)");
    const apply = () => {
      if (mobileMq.matches) setLayout("mobile");
      else if (desktopMq.matches) setLayout("desktop");
      else setLayout("tablet");
    };
    mobileMq.addEventListener("change", apply);
    desktopMq.addEventListener("change", apply);
    return () => {
      mobileMq.removeEventListener("change", apply);
      desktopMq.removeEventListener("change", apply);
    };
  }, []);

  useEffect(() => {
    if (layout !== "mobile" && mobileOpen) setMobileOpen(false);
  }, [layout, mobileOpen]);

  const openMobile = useCallback(() => setMobileOpen(true), []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const toggleMobile = useCallback(() => setMobileOpen((o) => !o), []);

  const value = useMemo<SidebarLayoutContextValue>(
    () => ({ layout, mobileOpen, openMobile, closeMobile, toggleMobile }),
    [layout, mobileOpen, openMobile, closeMobile, toggleMobile],
  );

  return <SidebarLayoutContext.Provider value={value}>{children}</SidebarLayoutContext.Provider>;
}

export function useSidebarLayout(): SidebarLayoutContextValue {
  const ctx = useContext(SidebarLayoutContext);
  if (!ctx) {
    throw new Error("useSidebarLayout must be used within SidebarLayoutProvider");
  }
  return ctx;
}

/** Quando o layout com sidebar não está montado (ex.: rota pública), retorna null. */
export function useSidebarLayoutOptional(): SidebarLayoutContextValue | null {
  return useContext(SidebarLayoutContext);
}
