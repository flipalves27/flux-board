"use client";

import { useTranslations } from "next-intl";
import { IconBoards, IconBuilding, IconCalendar, IconTemplates } from "./icons";
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
        sublabel={t("boardsSublabel")}
      />
      <SidebarNavLink
        path="/projects"
        hint={t("hints.projects")}
        icon={<IconBuilding className="h-4 w-4 shrink-0" />}
        label={t("projects")}
        sublabel={t("projectsSublabel")}
      />
      <SidebarNavLink
        path="/calendar"
        hint={t("hints.deliveryCalendar")}
        icon={<IconCalendar className="h-4 w-4 shrink-0" />}
        label={t("deliveryCalendar")}
        sublabel={t("deliveryCalendarSublabel")}
      />
      <SidebarNavLink
        path="/templates"
        hint={t("hints.templates")}
        icon={<IconTemplates className="h-4 w-4 shrink-0" />}
        label={t("templates")}
        sublabel={t("templatesSublabel")}
      />
    </div>
  );
}
