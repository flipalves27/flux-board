"use client";

import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { SidebarLayoutProvider, useSidebarLayout } from "@/context/sidebar-layout-context";
import { Sidebar } from "@/components/sidebar";
import { TrialBillingBanner } from "@/components/trial-billing-banner";
import { GlobalHotkeys } from "@/components/hotkeys/global-hotkeys";

const CommandPalette = dynamic(
  () => import("@/components/command-palette/command-palette").then((m) => m.CommandPalette),
  { ssr: false }
);
const CeremonyPlanningModal = dynamic(() => import("@/components/ceremonies/ceremony-planning-modal"), {
  ssr: false,
});
const StandupModal = dynamic(() => import("@/components/ceremonies/standup-modal"), { ssr: false });
const CeremonyRetroModal = dynamic(() => import("@/components/kanban/ceremony-retro-modal"), { ssr: false });
import { useRoutineTasks } from "@/context/routine-tasks-context";
import { playAlertSound } from "@/lib/alert-sounds";
import { useMobileDrawerPointer } from "@/lib/mobile-drawer-pointer";
import { WorkspaceFluxyDock } from "@/components/fluxy/workspace-fluxy-dock";
import { MobileAppHeader } from "@/components/mobile-app-header";
import { FluxAppBackdrop } from "@/components/ui/flux-app-backdrop";

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
    <div className="relative flex h-[100dvh] max-h-[100dvh] min-h-0 overflow-hidden max-md:pl-[env(safe-area-inset-left,0px)] max-md:pr-[env(safe-area-inset-right,0px)]">
      <FluxAppBackdrop className="absolute inset-0 z-[var(--flux-z-app-shell-bg)]" />
      <Sidebar />
      <div
        className={`relative z-[var(--flux-z-app-shell-content)] flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden touch-pan-y ${layout === "mobile" ? "max-md:min-h-0" : ""}`}
        {...(layout === "mobile" ? mainAreaProps : {})}
      >
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <TrialBillingBanner />
          <MobileAppHeader />
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        </div>
      </div>
      <WorkspaceFluxyDock />
      <CommandPalette />
      <GlobalHotkeys />
      <CeremonyRetroModal getHeaders={getHeaders} />
      <CeremonyPlanningModal getHeaders={getHeaders} />
      <StandupModal getHeaders={getHeaders} />
      <div className="pointer-events-none fixed bottom-[max(1rem,env(safe-area-inset-bottom,0px))] right-[max(1rem,env(safe-area-inset-right,0px))] z-[var(--flux-z-app-routine-toasts)] flex w-[min(360px,92vw)] flex-col gap-2">
        {alerts.map((alert) => (
          <button
            key={alert.id}
            type="button"
            onClick={() => dismissAlert(alert.id)}
            className="pointer-events-auto animate-[cardModalSlideIn_0.3s_ease] rounded-[var(--flux-rad-lg)] border border-[var(--flux-border-subtle)] bg-[color-mix(in_srgb,var(--flux-surface-card)_92%,transparent)] px-4 py-3 text-left shadow-[var(--flux-shadow-toast-strong)] backdrop-blur-[18px]"
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
    return (
      <>
        {children}
        <WorkspaceFluxyDock />
      </>
    );
  }

  return (
    <SidebarLayoutProvider>
      <AppShellWithSidebar>{children}</AppShellWithSidebar>
    </SidebarLayoutProvider>
  );
}
