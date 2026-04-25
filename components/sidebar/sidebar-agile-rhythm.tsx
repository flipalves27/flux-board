"use client";

import { useTranslations } from "next-intl";
import { IconMyWork, IconRelease, IconSprint, IconTasks } from "./icons";
import { SidebarNavLink } from "./sidebar-nav-link";

type SidebarAgileRhythmProps = {
  activeSprintCount: number | null;
  upcomingReleaseCount: number | null;
};

export function SidebarAgileRhythm({ activeSprintCount, upcomingReleaseCount }: SidebarAgileRhythmProps) {
  const t = useTranslations("navigation");
  return (
    <div className="flex flex-col gap-1" data-flux-sidebar-zone="agile-rhythm">
      <SidebarNavLink
        path="/routines"
        hint={t("hints.routines")}
        icon={<IconTasks className="h-4 w-4 shrink-0" />}
        label={t("routines")}
        sublabel={t("routinesSublabel")}
      />
      <SidebarNavLink
        path="/my-work"
        hint={t("hints.myWork")}
        icon={<IconMyWork className="h-4 w-4 shrink-0" />}
        label={t("myWork")}
        sublabel={t("myWorkSublabel")}
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
        badgeCount={activeSprintCount ?? undefined}
        badgeTone="attention"
      />
      <SidebarNavLink
        path="/releases"
        hint={t("hints.releases")}
        icon={<IconRelease className="h-4 w-4 shrink-0" />}
        label={t("releases")}
        sublabel={
          upcomingReleaseCount !== null && upcomingReleaseCount > 0
            ? t("releasesUpcomingSublabel", { count: upcomingReleaseCount })
            : undefined
        }
        badgeCount={upcomingReleaseCount ?? undefined}
        badgeTone="ai"
      />
    </div>
  );
}
