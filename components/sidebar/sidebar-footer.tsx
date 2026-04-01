"use client";

import { useTranslations } from "next-intl";
import { IconLogout, IconMonitor, IconMoon, IconSun } from "./icons";
import { CustomTooltip } from "@/components/ui/custom-tooltip";
import { useSidebarNav } from "./sidebar-nav-context";
import type { ThemePreference } from "@/lib/theme-storage";

export type SidebarFooterProps = {
  themePreference: ThemePreference;
  cycleThemePreference: () => void;
  logout: () => void | Promise<void>;
};

export function SidebarFooter({ themePreference, cycleThemePreference, logout }: SidebarFooterProps) {
  const t = useTranslations("navigation");
  const { showExpandedNav, linkClass, isMinimal } = useSidebarNav();
  const themeModeLabel =
    themePreference === "system"
      ? t("theme.mode.system")
      : themePreference === "light"
        ? t("theme.mode.light")
        : t("theme.mode.dark");

  return (
    <div
      className={`flex shrink-0 flex-col gap-1 border-t p-2.5 ${
        isMinimal ? "border-[var(--flux-chrome-alpha-08)]" : "border-[var(--flux-primary-alpha-08)]"
      }`}
      data-flux-sidebar-zone="footer"
    >
      <CustomTooltip content={t("theme.cycleTooltip", { current: themeModeLabel })} position="right">
        <button
          type="button"
          onClick={() => cycleThemePreference()}
          aria-label={t("theme.cycleTooltip", { current: themeModeLabel })}
          className={`flex w-full items-center gap-2.5 overflow-hidden rounded-[var(--flux-rad-sm)] bg-transparent px-2.5 py-2 font-display text-sm font-semibold transition-all
            text-[var(--flux-text-muted)] hover:bg-[var(--flux-primary-alpha-06)] hover:text-[var(--flux-primary)]`}
        >
          {themePreference === "system" ? (
            <IconMonitor className="h-4 w-4 shrink-0" />
          ) : themePreference === "light" ? (
            <IconSun className="h-4 w-4 shrink-0" />
          ) : (
            <IconMoon className="h-4 w-4 shrink-0" />
          )}
          {showExpandedNav && <span>{themeModeLabel}</span>}
        </button>
      </CustomTooltip>
      <button
        type="button"
        onClick={() => void logout()}
        className={`${linkClass("")} text-[var(--flux-danger)] hover:!bg-[var(--flux-danger-alpha-12)] hover:!text-[var(--flux-danger)]`}
      >
        <IconLogout className="h-4 w-4 shrink-0" />
        {showExpandedNav && <span>{t("logout")}</span>}
      </button>
    </div>
  );
}
