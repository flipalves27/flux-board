"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { SidebarLayoutProvider, useSidebarLayout } from "@/context/sidebar-layout-context";
import { Sidebar } from "@/components/sidebar";
import { MobileAppHeader } from "@/components/mobile-app-header";
import { CommandPalette } from "@/components/command-palette/command-palette";
import { useRoutineTasks } from "@/context/routine-tasks-context";
import { playAlertSound } from "@/lib/alert-sounds";
import { useMobileDrawerPointer } from "@/lib/mobile-drawer-pointer";

function AppShellWithSidebar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { layout, mobileOpen, openMobile, closeMobile } = useSidebarLayout();
  const { mainAreaProps } = useMobileDrawerPointer({
    enabled: layout === "mobile",
    drawerOpen: mobileOpen,
    onOpen: openMobile,
    onClose: closeMobile,
  });

  const localeSegment = pathname.split("/")[1];
  const { alerts, dismissAlert } = useRoutineTasks();
  const t = useTranslations("appShell");

  return (
    <div className="flex min-h-screen min-h-[100dvh]">
      <Sidebar />
      <div
        className={`flex min-h-0 min-w-0 flex-1 flex-col touch-pan-y ${layout === "mobile" ? "max-md:min-h-[100dvh]" : ""}`}
        {...(layout === "mobile" ? mainAreaProps : {})}
      >
        <MobileAppHeader />
        <div className="min-h-0 min-w-0 flex-1">{children}</div>
      </div>
      <CommandPalette />
      <div className="pointer-events-none fixed bottom-4 right-4 z-[450] flex w-[min(360px,92vw)] flex-col gap-2">
        {alerts.map((alert) => (
          <button
            key={alert.id}
            type="button"
            onClick={() => dismissAlert(alert.id)}
            className="pointer-events-auto animate-[cardModalSlideIn_0.3s_ease] rounded-[var(--flux-rad)] border border-[var(--flux-secondary-alpha-35)] bg-[var(--flux-surface-card)]/95 px-4 py-3 text-left shadow-[var(--flux-shadow-toast-strong)] backdrop-blur-sm"
          >
            <p className="font-display text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-secondary)]">
              {t("routineReminder")}
            </p>
            <p className="mt-1 text-sm font-semibold text-[var(--flux-text)]">{alert.title}</p>
            <p className="mt-1 text-xs text-[var(--flux-text-muted)]">
              {t("dueLabel")}{" "}
              {new Date(alert.dueAt).toLocaleTimeString(localeSegment === "en" ? "en-US" : "pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, isChecked } = useAuth();
  const { alerts } = useRoutineTasks();
  const announcedAlertsRef = useRef<Set<string>>(new Set());

  const normalizedPath = pathname.replace(/^\/(pt-BR|en)(?=\/|$)/, "") || "/";
  const isPublicRoute =
    normalizedPath === "/" ||
    normalizedPath === "/login" ||
    normalizedPath === "/onboarding" ||
    normalizedPath.startsWith("/portal/") ||
    normalizedPath.startsWith("/forms/") ||
    normalizedPath.startsWith("/embed/");
  const showSidebar = isChecked && user && !isPublicRoute;

  useEffect(() => {
    if (!showSidebar) return;
    alerts.forEach((alert) => {
      if (announcedAlertsRef.current.has(alert.id)) return;
      announcedAlertsRef.current.add(alert.id);
      playAlertSound(alert.soundId);
    });
  }, [alerts, showSidebar]);

  if (!showSidebar) {
    return <>{children}</>;
  }

  return (
    <SidebarLayoutProvider>
      <AppShellWithSidebar>{children}</AppShellWithSidebar>
    </SidebarLayoutProvider>
  );
}
