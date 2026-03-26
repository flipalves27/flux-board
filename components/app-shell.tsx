"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { SidebarLayoutProvider, useSidebarLayout } from "@/context/sidebar-layout-context";
import { Sidebar } from "@/components/sidebar";
import { TrialBillingBanner } from "@/components/trial-billing-banner";
import { CommandPalette } from "@/components/command-palette/command-palette";
import { GlobalHotkeys } from "@/components/hotkeys/global-hotkeys";
import CeremonyPlanningModal from "@/components/ceremonies/ceremony-planning-modal";
import StandupModal from "@/components/ceremonies/standup-modal";
import CeremonyRetroModal from "@/components/kanban/ceremony-retro-modal";
import { useRoutineTasks } from "@/context/routine-tasks-context";
import { playAlertSound } from "@/lib/alert-sounds";
import { useMobileDrawerPointer } from "@/lib/mobile-drawer-pointer";

function AppShellWithSidebar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { getHeaders } = useAuth();
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
    <div className="flex h-[100dvh] max-h-[100dvh] min-h-0 overflow-hidden">
      <Sidebar />
      <div
        className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden touch-pan-y ${layout === "mobile" ? "max-md:min-h-0" : ""}`}
        {...(layout === "mobile" ? mainAreaProps : {})}
      >
        <TrialBillingBanner />
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </div>
      <CommandPalette />
      <GlobalHotkeys />
      <CeremonyRetroModal getHeaders={getHeaders} />
      <CeremonyPlanningModal getHeaders={getHeaders} />
      <StandupModal getHeaders={getHeaders} />
      <div className="pointer-events-none fixed bottom-4 right-4 z-[var(--flux-z-app-routine-toasts)] flex w-[min(360px,92vw)] flex-col gap-2">
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
  const isTeamRoute = normalizedPath === "/equipe" || normalizedPath.startsWith("/equipe/");
  const showSidebar = isChecked && user && !isPublicRoute && !isTeamRoute;

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
