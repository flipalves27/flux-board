"use client";

import { createContext, useContext, type ReactNode } from "react";

export type SidebarLayoutMode = "mobile" | "tablet" | "desktop";

export type SidebarNavContextValue = {
  locale: string;
  layout: SidebarLayoutMode;
  showExpandedNav: boolean;
  compactMode: boolean;
  isMinimal: boolean;
  closeMobile: () => void;
  isActive: (href: string) => boolean;
  linkClass: (href: string) => string;
};

const SidebarNavContext = createContext<SidebarNavContextValue | null>(null);

export function SidebarNavProvider({
  value,
  children,
}: {
  value: SidebarNavContextValue;
  children: ReactNode;
}) {
  return <SidebarNavContext.Provider value={value}>{children}</SidebarNavContext.Provider>;
}

export function useSidebarNav() {
  const ctx = useContext(SidebarNavContext);
  if (!ctx) throw new Error("useSidebarNav must be used within SidebarNavProvider");
  return ctx;
}
