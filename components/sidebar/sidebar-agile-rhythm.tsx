"use client";

import { useTranslations } from "next-intl";
import { IconMyWork, IconSprint, IconTasks } from "./icons";
import { SidebarNavLink } from "./sidebar-nav-link";

type SidebarAgileRhythmProps = {
  activeSprintCount: number | null;
};

export function SidebarAgileRhythm({ activeSprintCount }: SidebarAgileRhythmProps) {
  const t = useTranslations("navigation");
  return (
    <div className="flex flex-col gap-1" data-flux-sidebar-zone="agile-rhythm">
      <SidebarNavLink
        path="/tasks"
        hint={t("hints.tasks")}
        icon={<IconTasks className="h-4 w-4 shrink-0" />}
        label={t("tasks")}
      />
      <SidebarNavLink
        path="/my-work"
        hint={t("hints.myWork")}
        icon={<IconMyWork className="h-4 w-4 shrink-0" />}
        label={t("myWork")}
      />
      <SidebarNavLink
        path="/sprints"
        hint={t("hints.sprints")}
        icon={<IconSprint className="h-4 w-4 shrink-0" />}
        label={t("sprints")}
        sublabel={
          activeSprintCount !== null && activeSprintCount > 0
            ? t("sprintsActiveSublabel", { count: activeSprintCount })
            : undefined
        }
      />
    </div>
  );
}
