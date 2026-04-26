"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { useOrgBranding, usePlatformDisplayName } from "@/context/org-branding-context";
import { useTheme } from "@/context/theme-context";
import { useSidebarLayout } from "@/context/sidebar-layout-context";
import { apiGet, ApiError } from "@/lib/api-client";
import { useOrgFeaturesOptional } from "@/hooks/use-org-features";
import { useSpecPlanActiveStore } from "@/stores/spec-plan-active-store";
import { useMobileDrawerPointer } from "@/lib/mobile-drawer-pointer";
import { sessionCanManageOrgBilling } from "@/lib/rbac";
import {
  SIDEBAR_COLLAPSED_STORAGE_KEY,
  SIDEBAR_WIDTH_COLLAPSED,
  SIDEBAR_WIDTH_EXPANDED,
  SIDEBAR_WIDTH_TABLET_RAIL,
} from "./constants";
import { SidebarNavProvider } from "./sidebar-nav-context";
import type { SidebarLayoutMode } from "./sidebar-nav-context";
import { SidebarAgileRhythm } from "./sidebar-agile-rhythm";
import { SidebarFooter } from "./sidebar-footer";
import { SidebarHeader } from "./sidebar-header";
import { SidebarIntelligence } from "./sidebar-intelligence";
import { SidebarQuickAccess } from "./sidebar-quick-access";
import { SidebarWorkspace } from "./sidebar-workspace";
import { SidebarOrgSwitcher } from "./sidebar-org-switcher";
import { SidebarZoneCollapsible } from "./sidebar-zone-collapsible";
import { useModalA11y } from "@/components/ui/use-modal-a11y";
import { normalizeAppPath } from "@/lib/public-routes";

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout, isChecked, getHeaders, switchOrganization } = useAuth();
  const orgBrandingCtx = useOrgBranding();
  const orgLogoUrl = orgBrandingCtx?.effectiveBranding?.logoUrl?.trim();
  const platformName = usePlatformDisplayName();
  const { themePreference, cycleThemePreference } = useTheme();
  const { layout, mobileOpen, closeMobile, openMobile } = useSidebarLayout();
  const drawerRef = useRef<HTMLElement | null>(null);
  const isMinimal = true;
  const [collapsed, setCollapsed] = useState(false);
  const [tabletHover, setTabletHover] = useState(false);
  const t = useTranslations("navigation");
  const { drawerProps } = useMobileDrawerPointer({
    enabled: layout === "mobile",
    drawerOpen: mobileOpen,
    onOpen: openMobile,
    onClose: closeMobile,
  });

  const [activeInvites, setActiveInvites] = useState<number | null>(null);
  const [activeSprintCount, setActiveSprintCount] = useState<number | null>(null);
  const [upcomingReleaseCount, setUpcomingReleaseCount] = useState<number | null>(null);
  const orgFeatures = useOrgFeaturesOptional();
  const specScopePlannerEnabled = Boolean(orgFeatures?.data?.spec_ai_scope_planner);
  const specPlanActiveCount = useSpecPlanActiveStore((s) => s.active.length);

  const localeSegment = pathname.split("/")[1];
  const locale = localeSegment === "en" ? "en" : "pt-BR";
  const normalizedPath = normalizeAppPath(pathname);

  useModalA11y({
    open: layout === "mobile" && mobileOpen,
    onClose: closeMobile,
    containerRef: drawerRef,
  });

  useEffect(() => {
    try {
      const v = localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
      if (v === "true") setCollapsed(true);
      if (v === "false") setCollapsed(false);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (layout !== "mobile" || !mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMobile();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [layout, mobileOpen, closeMobile]);

  useEffect(() => {
    if (layout !== "mobile" || !mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [layout, mobileOpen]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!isChecked || !user?.orgId || !sessionCanManageOrgBilling(user)) {
        setActiveInvites(null);
        return;
      }
      try {
        const data = await apiGet<{ activeInvites: number }>("/api/organization-invites/active-count", getHeaders());
        if (!cancelled) setActiveInvites(typeof data?.activeInvites === "number" ? data.activeInvites : 0);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          setActiveInvites(null);
          return;
        }
        setActiveInvites(null);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [isChecked, user, getHeaders]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!isChecked || !user?.orgId) {
        setActiveSprintCount(null);
        setUpcomingReleaseCount(null);
        return;
      }
      try {
        const sprintSum = await apiGet<{ activeSprintCount: number }>("/api/sprints?summary=1", getHeaders());
        if (cancelled) return;
        setActiveSprintCount(
          typeof sprintSum?.activeSprintCount === "number" ? sprintSum.activeSprintCount : 0
        );
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          setActiveSprintCount(null);
        } else {
          setActiveSprintCount(null);
        }
      }
      try {
        if (cancelled) return;
        if (!isChecked || !user?.orgId) {
          setUpcomingReleaseCount(null);
          return;
        }
        const relSum = await apiGet<{ upcomingReleaseCount: number }>("/api/releases?summary=1", getHeaders());
        if (cancelled) return;
        setUpcomingReleaseCount(
          typeof relSum?.upcomingReleaseCount === "number" ? relSum.upcomingReleaseCount : 0
        );
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          setUpcomingReleaseCount(null);
        } else {
          setUpcomingReleaseCount(null);
        }
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [isChecked, user?.orgId, getHeaders]);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      if (!isChecked || !user?.orgId || !specScopePlannerEnabled) {
        useSpecPlanActiveStore.getState().setActive([]);
        return;
      }
      try {
        const data = await apiGet<{
          active?: { runId: string; boardId: string; updatedAt: string; status?: string }[];
        }>("/api/spec-plan/active-runs", getHeaders());
        if (!cancelled && Array.isArray(data?.active)) {
          useSpecPlanActiveStore.getState().setActive(data.active);
        }
      } catch {
        if (!cancelled) useSpecPlanActiveStore.getState().setActive([]);
      }
    }
    void tick();
    const id = window.setInterval(() => void tick(), 10000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [isChecked, user?.orgId, specScopePlannerEnabled, getHeaders]);

  const showExpandedNav =
    layout === "mobile" || (layout === "tablet" && tabletHover) || (layout === "desktop" && !collapsed);
  const compactMode = !showExpandedNav;

  const sidebarWidth =
    layout === "tablet"
      ? tabletHover
        ? SIDEBAR_WIDTH_EXPANDED
        : SIDEBAR_WIDTH_TABLET_RAIL
      : layout === "desktop"
        ? collapsed
          ? SIDEBAR_WIDTH_COLLAPSED
          : SIDEBAR_WIDTH_EXPANDED
        : SIDEBAR_WIDTH_EXPANDED;

  const toggleDesktopCollapsed = () => {
    if (layout !== "desktop") return;
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const isActive = (href: string) => {
    if (href === "/boards") return normalizedPath === "/boards";
    if (href === "/calendar") return normalizedPath.startsWith("/calendar");
    if (href === "/reports") return normalizedPath === "/reports";
    if (href === "/ai") return normalizedPath === "/ai" || normalizedPath === "/portfolio";
    if (href === "/dashboard") return normalizedPath === "/dashboard" || normalizedPath === "/portfolio";
    if (href === "/portfolio") return normalizedPath === "/portfolio";
    if (href === "/okrs") return normalizedPath === "/okrs";
    if (href === "/templates") return normalizedPath.startsWith("/templates");
    if (href === "/tasks") return normalizedPath.startsWith("/tasks") || normalizedPath.startsWith("/routines");
    if (href === "/routines") return normalizedPath.startsWith("/routines");
    if (href === "/my-work") return normalizedPath.startsWith("/my-work");
    if (href === "/sprints") return normalizedPath.startsWith("/sprints");
    if (href === "/docs") return normalizedPath.startsWith("/docs");
    if (href === "/spec-plan") return normalizedPath.startsWith("/spec-plan");
    if (href === "/users") return normalizedPath === "/users";
    if (href === "/equipe") return normalizedPath.startsWith("/equipe");
    if (href === "/billing") return normalizedPath === "/billing";
    if (href === "/org-settings") return normalizedPath === "/org-settings";
    if (href === "/org-invites") return normalizedPath === "/org-invites";
    if (href === "/org-audit") return normalizedPath === "/org-audit";
    if (href === "/rate-limit-abuse") return normalizedPath === "/rate-limit-abuse";
    if (href === "/admin/tracer") return normalizedPath.startsWith("/admin/tracer");
    return normalizedPath === href;
  };

  const linkClass = (href: string) => {
    const active = isActive(href);
    if (isMinimal) {
      return `relative flex items-center gap-2.5 w-full px-2.5 py-2 rounded-r-[var(--flux-rad-sm)] font-semibold text-sm transition-all duration-200 ease-out font-display overflow-hidden border-y-0 border-r-0 border-l-2
       ${active
         ? "border-l-[var(--flux-primary-light)] bg-[var(--flux-primary-alpha-08)] text-[var(--flux-text)]"
         : "border-l-transparent text-[var(--flux-text-muted)] hover:bg-[var(--flux-primary-alpha-05)] hover:text-[var(--flux-text)]"
       }`;
    }
    return `relative flex items-center gap-2.5 w-full px-2.5 py-2 rounded-[var(--flux-rad-sm)] font-semibold text-sm transition-all duration-200 ease-out font-display overflow-hidden border
     ${active
       ? "border-[var(--flux-primary-alpha-25)] bg-[linear-gradient(135deg,var(--flux-primary-alpha-20),var(--flux-primary-alpha-10))] text-[var(--flux-primary-light)] shadow-[0_6px_20px_var(--flux-primary-alpha-12)]"
       : "border-transparent text-[var(--flux-text-muted)] hover:border-[var(--flux-primary-alpha-12)] hover:bg-[var(--flux-primary-alpha-06)] hover:text-[var(--flux-text)]"
     }`;
  };

  const navContextValue = {
    locale,
    layout: layout as SidebarLayoutMode,
    showExpandedNav,
    compactMode,
    isMinimal,
    closeMobile,
    isActive,
    linkClass,
  };

  const mobileClosed = layout === "mobile" && !mobileOpen;

  return (
    <>
      {layout === "mobile" && mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-[var(--flux-z-sidebar-backdrop)] bg-[var(--flux-surface-dark)]/55 backdrop-blur-md md:hidden"
          aria-label={t("menu.closeNavigation")}
          onClick={closeMobile}
        />
      ) : null}

      <aside
        ref={drawerRef}
        {...(layout === "mobile" ? drawerProps : {})}
        role={layout === "mobile" && mobileOpen ? "dialog" : undefined}
        aria-modal={layout === "mobile" && mobileOpen ? true : undefined}
        aria-label={layout === "mobile" && mobileOpen ? t("menu.navigationPanel") : undefined}
        aria-hidden={mobileClosed || undefined}
        onMouseEnter={() => layout === "tablet" && setTabletHover(true)}
        onMouseLeave={() => layout === "tablet" && setTabletHover(false)}
        tabIndex={layout === "mobile" ? -1 : undefined}
        className={`flex shrink-0 flex-col overflow-hidden transition-[width,transform] duration-300 ease-out
          ${isMinimal
            ? "flux-glass-surface rounded-none border-y-0 border-l-0 border-r-[var(--flux-glass-surface-border)] flux-depth-1"
            : "flux-glass-surface rounded-none border-y-0 border-l-0 border-r-[var(--flux-glass-elevated-border)] flux-depth-2"
          }
          max-md:fixed max-md:left-0 max-md:top-0 max-md:z-[var(--flux-z-sidebar-drawer)] max-md:h-[100dvh] max-md:max-h-[100dvh] max-md:w-[min(280px,calc(100vw-24px))] max-md:shadow-[var(--flux-shadow-lg)]
          max-md:-translate-x-full max-md:pointer-events-none max-md:data-[open]:translate-x-0 max-md:data-[open]:pointer-events-auto
          md:relative md:z-[var(--flux-z-app-shell-content)] md:h-full md:min-h-0 md:translate-x-0 md:pointer-events-auto md:shadow-none`}
        style={layout === "mobile" ? undefined : { width: sidebarWidth }}
        data-open={layout === "mobile" && mobileOpen ? "" : undefined}
      >
        <SidebarHeader
          locale={locale}
          layout={layout as SidebarLayoutMode}
          orgLogoUrl={orgLogoUrl}
          platformName={platformName}
          showExpandedNav={showExpandedNav}
          compactMode={compactMode}
          isMinimal={isMinimal}
          collapsed={collapsed}
          closeMobile={closeMobile}
          toggleDesktopCollapsed={toggleDesktopCollapsed}
          expandLabel={t("menu.expand")}
          collapseLabel={t("menu.collapse")}
          closeNavLabel={t("menu.closeNavigation")}
        />

        <SidebarNavProvider value={navContextValue}>
          <SidebarOrgSwitcher
            user={user}
            layout={layout as SidebarLayoutMode}
            showExpandedNav={showExpandedNav}
            closeMobile={closeMobile}
            switchOrganization={switchOrganization}
          />
          <nav className="flux-sidebar-nav-stack mx-1.5 mb-1 flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-x-hidden overflow-y-auto overscroll-contain px-2 py-2.5">
            <SidebarZoneCollapsible title={t("zones.quick")} defaultOpen>
              <SidebarQuickAccess />
            </SidebarZoneCollapsible>
            <SidebarZoneCollapsible title={t("zones.rhythm")} defaultOpen>
              <SidebarAgileRhythm activeSprintCount={activeSprintCount} upcomingReleaseCount={upcomingReleaseCount} />
            </SidebarZoneCollapsible>
            <SidebarZoneCollapsible title={t("zones.intelligence")} defaultOpen>
              <SidebarIntelligence
                user={user}
                specScopePlannerEnabled={specScopePlannerEnabled}
                specPlanActiveCount={specPlanActiveCount}
              />
            </SidebarZoneCollapsible>
            <SidebarZoneCollapsible title={t("zones.workspace")} defaultOpen>
              <SidebarWorkspace user={user} activeInvites={activeInvites} />
            </SidebarZoneCollapsible>
          </nav>

          <SidebarFooter
            themePreference={themePreference}
            cycleThemePreference={cycleThemePreference}
            logout={logout}
          />
        </SidebarNavProvider>
      </aside>
    </>
  );
}
