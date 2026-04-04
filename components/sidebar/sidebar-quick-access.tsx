"use client";

import { useTranslations } from "next-intl";
import { IconBoards, IconTemplates } from "./icons";
import { SidebarNavLink } from "./sidebar-nav-link";
import { SidebarSectionTitle } from "./sidebar-section-title";

export function SidebarQuickAccess() {
  const t = useTranslations("navigation");
  return (
    <div className="flex flex-col gap-1" data-flux-sidebar-zone="quick-access">
      <SidebarSectionTitle>{t("section.work")}</SidebarSectionTitle>
      <SidebarNavLink
        path="/boards"
        hint={t("hints.boards")}
        icon={<IconBoards className="h-4 w-4 shrink-0" />}
        label={t("boards")}
      />
      <SidebarNavLink
        path="/templates"
        hint={t("hints.templates")}
        icon={<IconTemplates className="h-4 w-4 shrink-0" />}
        label={t("templates")}
      />
    </div>
  );
}
