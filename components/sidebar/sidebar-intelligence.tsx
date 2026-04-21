"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useSpecPlanActiveStore } from "@/stores/spec-plan-active-store";
import {
  IconBoards,
  IconDocs,
  IconExecutiveDashboard,
  IconGoals,
  IconReports,
  IconSpecScope,
} from "./icons";
import { SidebarNavLink } from "./sidebar-nav-link";
import { SidebarSectionTitle } from "./sidebar-section-title";
import type { AuthUser } from "@/context/auth-context";
import { sessionCanManageOrgBilling } from "@/lib/rbac";
import { readSidebarNavFreq, scoreForSidebarPath } from "@/lib/sidebar-nav-frequency";

type SidebarIntelligenceProps = {
  user: AuthUser | null;
  specScopePlannerEnabled: boolean;
  specPlanActiveCount: number;
};

type IntelLinkDef = {
  path: string;
  order: number;
  node: ReactNode;
};

export function SidebarIntelligence({
  user,
  specScopePlannerEnabled,
  specPlanActiveCount,
}: SidebarIntelligenceProps) {
  const t = useTranslations("navigation");
  const specPlanActive = useSpecPlanActiveStore((s) => s.active);
  const specPlanHref =
    specPlanActiveCount === 1 && specPlanActive[0]
      ? `/spec-plan?run=${encodeURIComponent(specPlanActive[0].runId)}&board=${encodeURIComponent(specPlanActive[0].boardId)}`
      : "/spec-plan";
  const [freq, setFreq] = useState(() => (typeof window !== "undefined" ? readSidebarNavFreq() : {}));

  useEffect(() => {
    const sync = () => setFreq(readSidebarNavFreq());
    sync();
    window.addEventListener("flux-sidebar-nav-freq", sync);
    return () => window.removeEventListener("flux-sidebar-nav-freq", sync);
  }, []);

  const defs: IntelLinkDef[] = useMemo(() => {
    const base: IntelLinkDef[] = [
      {
        path: "/reports",
        order: 0,
        node: (
          <SidebarNavLink
            key="intel-reports"
            trackPath="/reports"
            path="/reports"
            hint={t("hints.reports")}
            icon={<IconReports className="h-4 w-4 shrink-0" />}
            label={t("reports")}
            sublabel={t("reportsProduct")}
            dataTour="board-reports"
          />
        ),
      },
      ...(user && sessionCanManageOrgBilling(user)
        ? ([
            {
              path: "/portfolio",
              order: 1,
              node: (
                <SidebarNavLink
                  key="intel-portfolio"
                  trackPath="/portfolio"
                  path="/portfolio"
                  hint={t("hints.portfolio")}
                  icon={<IconExecutiveDashboard className="h-4 w-4 shrink-0" />}
                  label={t("portfolio")}
                  sublabel={t("portfolioProduct")}
                />
              ),
            },
          ] satisfies IntelLinkDef[])
        : ([
            {
              path: "/boards",
              order: 1,
              node: (
                <SidebarNavLink
                  key="intel-boards"
                  trackPath="/boards"
                  path="/boards"
                  hint={t("hints.boards")}
                  icon={<IconBoards className="h-4 w-4 shrink-0" />}
                  label={t("boards")}
                  sublabel={t("boards")}
                />
              ),
            },
          ] satisfies IntelLinkDef[])),
    ];

    base.push(
      {
        path: "/okrs",
        order: 3,
        node: (
          <SidebarNavLink
            key="intel-okrs"
            trackPath="/okrs"
            path="/okrs"
            hint={t("hints.okrs")}
            icon={<IconGoals className="h-4 w-4 shrink-0" />}
            label={t("okrs")}
          />
        ),
      },
      {
        path: "/docs",
        order: 4,
        node: (
          <SidebarNavLink
            key="intel-docs"
            trackPath="/docs"
            path="/docs"
            hint={t("hints.docs")}
            icon={<IconDocs className="h-4 w-4 shrink-0" />}
            label={t("docs")}
          />
        ),
      }
    );

    if (specScopePlannerEnabled) {
      base.push({
        path: "/spec-plan",
        order: 5,
        node: (
          <SidebarNavLink
            key="intel-spec"
            trackPath="/spec-plan"
            path={specPlanHref}
            hint={t("hints.specScopePlanner")}
            icon={<IconSpecScope className="h-4 w-4 shrink-0" />}
            label={t("specScopePlanner")}
            sublabel={t("specScopePlannerProduct")}
            badgeDot={specPlanActiveCount > 0}
          />
        ),
      });
    }

    return base;
  }, [user, specScopePlannerEnabled, specPlanActiveCount, specPlanHref, t]);

  const sorted = useMemo(() => {
    return [...defs].sort((a, b) => {
      const sb = scoreForSidebarPath(b.path, freq);
      const sa = scoreForSidebarPath(a.path, freq);
      if (sb !== sa) return sb - sa;
      return a.order - b.order;
    });
  }, [defs, freq]);

  return (
    <div className="flex flex-col gap-1" data-flux-sidebar-zone="intelligence">
      <SidebarSectionTitle
        badgeCount={specPlanActiveCount > 0 ? specPlanActiveCount : undefined}
        badgeLabel={t("intelligenceBadgeLabel", { count: specPlanActiveCount })}
      >
        {t("section.intelligence")}
      </SidebarSectionTitle>
      {sorted.map((d) => d.node)}
    </div>
  );
}
