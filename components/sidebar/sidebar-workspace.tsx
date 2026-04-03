"use client";

import { useTranslations } from "next-intl";
import {
  IconBilling,
  IconBuilding,
  IconInvites,
  IconMonitor,
  IconSettings,
  IconShield,
  IconTeam,
  IconTracer,
  IconUsers,
} from "./icons";
import { SidebarNavLink } from "./sidebar-nav-link";
import { SidebarSectionTitle } from "./sidebar-section-title";
import type { AuthUser } from "@/context/auth-context";
import {
  isPlatformAdminSession,
  sessionCanManageMembersAndBilling,
  sessionCanManageOrgBilling,
} from "@/lib/rbac";

type SidebarWorkspaceProps = {
  user: AuthUser | null;
  activeInvites: number | null;
};

export function SidebarWorkspace({ user, activeInvites }: SidebarWorkspaceProps) {
  const t = useTranslations("navigation");
  return (
    <div className="flex flex-col gap-1" data-flux-sidebar-zone="workspace">
      {user && (sessionCanManageMembersAndBilling(user) || sessionCanManageOrgBilling(user)) ? (
        <>
          <SidebarSectionTitle>{t("section.org")}</SidebarSectionTitle>
          {sessionCanManageMembersAndBilling(user) ? (
            <SidebarNavLink
              path="/equipe"
              hint={t("hints.users")}
              icon={<IconTeam className="h-4 w-4 shrink-0" />}
              label="Equipe"
              sublabel={t("teamWorkspace")}
            />
          ) : null}
          {sessionCanManageOrgBilling(user) ? (
            <>
              <SidebarNavLink
                path="/users"
                hint={t("hints.users")}
                icon={<IconUsers className="h-4 w-4 shrink-0" />}
                label={t("users")}
                sublabel={t("userDirectory")}
              />
              <SidebarNavLink
                path="/org-invites"
                hint={
                  activeInvites !== null && activeInvites > 0
                    ? `${t("hints.invites")} (${activeInvites})`
                    : t("hints.invites")
                }
                icon={<IconInvites className="h-4 w-4 shrink-0" />}
                label={t("invites")}
                sublabel={activeInvites !== null && activeInvites > 0 ? String(activeInvites) : undefined}
              />
              <SidebarNavLink
                path="/org-audit"
                hint={t("hints.orgAudit")}
                icon={<IconMonitor className="h-4 w-4 shrink-0" />}
                label={t("orgAudit")}
              />
            </>
          ) : null}
        </>
      ) : null}

      {user && sessionCanManageOrgBilling(user) && (
        <>
          <div className="h-[6px]" />
          <SidebarSectionTitle>{t("section.commercial")}</SidebarSectionTitle>
          <SidebarNavLink
            path="/billing"
            hint={t("hints.billing")}
            icon={<IconBilling className="h-4 w-4 shrink-0" />}
            label={t("billing")}
          />
        </>
      )}

      {user && sessionCanManageOrgBilling(user) && (
        <SidebarNavLink
          path="/org-settings"
          hint={t("hints.organization")}
          icon={<IconSettings className="h-4 w-4 shrink-0" />}
          label={t("organization")}
        />
      )}

      {user && isPlatformAdminSession(user) && (
        <>
          <div className="h-[6px]" />
          <SidebarSectionTitle>{t("section.platformOps")}</SidebarSectionTitle>
          <SidebarNavLink
            path="/admin/platform"
            hint={t("hints.platformAdminConsole")}
            icon={<IconBuilding className="h-4 w-4 shrink-0" />}
            label={t("platformAdminConsole")}
            sublabel={t("platformAdminConsoleProduct")}
          />
          <SidebarNavLink
            path="/rate-limit-abuse"
            hint={t("hints.rateLimitAbuse")}
            icon={<IconShield className="h-4 w-4 shrink-0" />}
            label={t("rateLimitAbuse")}
          />
          <SidebarNavLink
            path="/admin/platform-commercial"
            hint={t("hints.platformCommercial")}
            icon={<IconBilling className="h-4 w-4 shrink-0" />}
            label={t("platformCommercial")}
          />
          <SidebarNavLink
            path="/admin/tracer"
            hint={t("hints.tracer")}
            icon={<IconTracer className="h-4 w-4 shrink-0" />}
            label={t("tracer")}
          />
        </>
      )}
    </div>
  );
}
