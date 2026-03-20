"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { Sidebar } from "@/components/sidebar";
import { useRoutineTasks } from "@/context/routine-tasks-context";
import { playAlertSound } from "@/lib/alert-sounds";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, isChecked } = useAuth();
  const { alerts, dismissAlert } = useRoutineTasks();
  const announcedAlertsRef = useRef<Set<string>>(new Set());
  const t = useTranslations("appShell");

  const localeSegment = pathname.split("/")[1];
  const normalizedPath = pathname.replace(/^\/(pt-BR|en)(?=\/|$)/, "") || "/";
  const isPublicRoute =
    normalizedPath === "/" ||
    normalizedPath === "/login" ||
    normalizedPath === "/onboarding" ||
    normalizedPath.startsWith("/portal/") ||
    normalizedPath.startsWith("/forms/");
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
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        {children}
      </div>
      <div className="fixed right-4 bottom-4 z-[450] flex w-[min(360px,92vw)] flex-col gap-2 pointer-events-none">
        {alerts.map((alert) => (
          <button
            key={alert.id}
            type="button"
            onClick={() => dismissAlert(alert.id)}
            className="pointer-events-auto text-left border border-[rgba(0,210,211,0.35)] bg-[var(--flux-surface-card)]/95 backdrop-blur-sm rounded-[var(--flux-rad)] px-4 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.3)] animate-[cardModalSlideIn_0.3s_ease]"
          >
            <p className="text-[11px] font-semibold tracking-wide text-[var(--flux-secondary)] font-display uppercase">
              {t("routineReminder")}
            </p>
            <p className="text-sm font-semibold text-[var(--flux-text)] mt-1">{alert.title}</p>
            <p className="text-xs text-[var(--flux-text-muted)] mt-1">
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
