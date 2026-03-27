"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { useOrgBranding, usePlatformDisplayName } from "@/context/org-branding-context";
import { useTheme } from "@/context/theme-context";
import { useSidebarLayout } from "@/context/sidebar-layout-context";
import { useNavigationVariant, useNavigationVariantActions } from "@/context/navigation-variant-context";
import { CustomTooltip } from "@/components/ui/custom-tooltip";
import { apiGet, ApiError } from "@/lib/api-client";
import { useMobileDrawerPointer } from "@/lib/mobile-drawer-pointer";

function FluxLogoIcon({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg viewBox="0 -4 44 48" fill="none" className={className} aria-hidden>
      <path d="M8 32L16 20L24 26L36 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M30 10H36V16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="20" r="2.5" fill="var(--flux-accent)" />
      <circle cx="24" cy="26" r="2.5" fill="var(--flux-secondary)" />
      <path d="M8 36H36" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

function IconBoards({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
      />
    </svg>
  );
}

function IconReports({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
      />
    </svg>
  );
}

function IconExecutiveDashboard({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 13l2 2 4-4" />
    </svg>
  );
}

function IconTemplates({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
      />
    </svg>
  );
}

function IconTasks({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function IconSprint({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function IconUsers({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
      />
    </svg>
  );
}

function IconTeam({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-1a4 4 0 00-5.874-3.526M17 20H7m10 0v-1c0-1.08-.206-2.11-.58-3.052M7 20H2v-1a4 4 0 015.874-3.526M7 20v-1c0-1.08.206-2.11.58-3.052M15 8a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function IconBriefcase({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9h18M7 9V7a2 2 0 012-2h6a2 2 0 012 2v2m-1 0v9a2 2 0 01-2 2H8a2 2 0 01-2-2V9" />
    </svg>
  );
}

function IconSettings({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37.521-1.027.094-2.262-1.065-2.572-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.61 2.197.214 2.572-1.065z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function IconBilling({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17 9V7a2 2 0 00-2-2H7a2 2 0 00-2 2v2m12 0a2 2 0 010 4H5a2 2 0 010-4m12 0v10a2 2 0 01-2 2H7a2 2 0 01-2-2V9"
      />
    </svg>
  );
}

function IconShield({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
      />
    </svg>
  );
}

function IconTracer({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function IconInvites({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12c0 8-9 13-9 13S3 20 3 12a9 9 0 1118 0z" />
    </svg>
  );
}

function IconGoals({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l2 2 4-4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8 8-4-4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2 2 1-1" />
    </svg>
  );
}

function IconDocs({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9l-5-5H7a2 2 0 00-2 2v13a2 2 0 002 2z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 4v5h5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6M9 17h4" />
    </svg>
  );
}

function IconProgramIncrements({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 16l2 2 4-4" />
    </svg>
  );
}

function IconLogout({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  );
}

function IconSun({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
      />
    </svg>
  );
}

function IconMoon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  );
}

function IconMonitor({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25"
      />
    </svg>
  );
}

function IconChevronLeft({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function IconChevronRight({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function IconClose({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function IconNavStyle({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h16" />
    </svg>
  );
}

const SIDEBAR_WIDTH_EXPANDED = 260;
const SIDEBAR_WIDTH_COLLAPSED = 72;
const SIDEBAR_WIDTH_TABLET_RAIL = 60;
const SIDEBAR_COLLAPSED_STORAGE_KEY = "flux-board.sidebar.collapsed";

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout, isChecked, getHeaders } = useAuth();
  const orgBrandingCtx = useOrgBranding();
  const orgLogoUrl = orgBrandingCtx?.effectiveBranding?.logoUrl?.trim();
  const platformName = usePlatformDisplayName();
  const { themePreference, cycleThemePreference } = useTheme();
  const { layout, mobileOpen, closeMobile, openMobile } = useSidebarLayout();
  const navVariant = useNavigationVariant();
  const navActions = useNavigationVariantActions();
  const isMinimal = navVariant === "minimal";
  const [collapsed, setCollapsed] = useState(false);
  const [tabletHover, setTabletHover] = useState(false);
  const t = useTranslations("navigation");
  const themeModeLabel =
    themePreference === "system"
      ? t("theme.mode.system")
      : themePreference === "light"
        ? t("theme.mode.light")
        : t("theme.mode.dark");
  const variantLabel = navVariant === "aurora" ? t("variant.aurora") : t("variant.minimal");

  const { drawerProps } = useMobileDrawerPointer({
    enabled: layout === "mobile",
    drawerOpen: mobileOpen,
    onOpen: openMobile,
    onClose: closeMobile,
  });

  const [activeInvites, setActiveInvites] = useState<number | null>(null);
  const [activeSprintCount, setActiveSprintCount] = useState<number | null>(null);

  const localeSegment = pathname.split("/")[1];
  const locale = localeSegment === "en" ? "en" : "pt-BR";
  const normalizedPath = pathname.replace(/^\/(pt-BR|en)(?=\/|$)/, "") || "/";
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
      if (!isChecked || !user?.isAdmin || !user?.orgId) {
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
  }, [isChecked, user?.isAdmin, user?.orgId, getHeaders]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!isChecked || !user?.orgId) {
        setActiveSprintCount(null);
        return;
      }
      try {
        const data = await apiGet<{ activeSprintCount: number }>(
          "/api/sprints?summary=1",
          getHeaders()
        );
        if (!cancelled) {
          setActiveSprintCount(typeof data?.activeSprintCount === "number" ? data.activeSprintCount : 0);
        }
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          setActiveSprintCount(null);
          return;
        }
        setActiveSprintCount(null);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [isChecked, user?.orgId, getHeaders]);

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
    if (href === "/reports") return normalizedPath === "/reports";
    if (href === "/dashboard") return normalizedPath === "/dashboard";
    if (href === "/okrs") return normalizedPath === "/okrs";
    if (href === "/templates") return normalizedPath.startsWith("/templates");
    if (href === "/tasks") return normalizedPath.startsWith("/tasks");
    if (href === "/my-work") return normalizedPath.startsWith("/my-work");
    if (href === "/sprints") return normalizedPath.startsWith("/sprints");
    if (href === "/program-increments") return normalizedPath.startsWith("/program-increments");
    if (href === "/docs") return normalizedPath.startsWith("/docs");
    if (href === "/negocios") return normalizedPath.startsWith("/negocios");
    if (href === "/users") return normalizedPath === "/users";
    if (href === "/equipe") return normalizedPath.startsWith("/equipe");
    if (href === "/billing") return normalizedPath === "/billing";
    if (href === "/org-settings") return normalizedPath === "/org-settings";
    if (href === "/org-invites") return normalizedPath === "/org-invites";
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

  function NavSectionTitle({ children }: { children: ReactNode }) {
    if (!showExpandedNav) return null;
    if (isMinimal) {
      return (
        <div className="px-2.5 pt-3 first:pt-1 pb-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--flux-text-muted)]/55">
            {children}
          </span>
        </div>
      );
    }
    return (
      <div className="mt-2 flex items-center gap-2 px-2.5 pt-3 first:mt-0 first:pt-1 pb-1">
        <span className="h-px flex-1 bg-[var(--flux-primary-alpha-12)]" aria-hidden />
        <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[var(--flux-text-muted)]/70">
          {children}
        </span>
        <span className="h-px flex-1 bg-[var(--flux-primary-alpha-12)]" aria-hidden />
      </div>
    );
  }

  type NavLinkProps = {
    path: string;
    icon: React.ReactNode;
    label: React.ReactNode;
    hint: string;
    sublabel?: string;
    dataTour?: string;
    /** When set, overrides `isActive(path)` (e.g. Copilot → /boards must not highlight with Boards). */
    isActiveOverride?: boolean;
  };

  function NavLink({ path, icon, label, hint, sublabel, dataTour, isActiveOverride }: NavLinkProps) {
    const href = `/${locale}${path}`;
    const navActive = isActiveOverride ?? isActive(path);
    const itemClass = isMinimal
      ? `relative flex items-center gap-2.5 w-full pl-3 pr-2.5 py-2 rounded-r-[var(--flux-rad-sm)] border-y-0 border-r-0 border-l-2 font-semibold text-sm transition-all duration-200 ease-out font-display overflow-hidden
         ${navActive
           ? "border-l-[var(--flux-primary-light)] bg-[var(--flux-primary-alpha-08)] text-[var(--flux-text)]"
           : "border-l-transparent text-[var(--flux-text-muted)] hover:bg-[var(--flux-primary-alpha-05)] hover:text-[var(--flux-text)]"
         }`
      : `relative flex items-center gap-2.5 w-full px-2.5 py-2 rounded-[var(--flux-rad-sm)] border font-semibold text-sm transition-all duration-200 ease-out font-display overflow-hidden
         ${navActive
           ? "border-[var(--flux-primary-alpha-25)] bg-[linear-gradient(135deg,var(--flux-primary-alpha-20),var(--flux-primary-alpha-10))] text-[var(--flux-primary-light)] shadow-[0_6px_20px_var(--flux-primary-alpha-12)]"
           : "border-transparent text-[var(--flux-text-muted)] hover:border-[var(--flux-primary-alpha-12)] hover:bg-[var(--flux-primary-alpha-06)] hover:text-[var(--flux-text)]"
         }`;
    const afterNav = () => {
      if (layout === "mobile") closeMobile();
    };
    const body = (
      <Link
        href={href}
        onClick={afterNav}
        data-tour={dataTour}
        className={`${itemClass} ${showExpandedNav && sublabel ? "items-start py-2.5" : ""}`}
      >
        {!isMinimal ? (
          <span
            className={`absolute left-1.5 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full transition-opacity duration-200 ${
              navActive ? "bg-[var(--flux-primary-light)] opacity-100" : "bg-[var(--flux-primary)] opacity-0"
            }`}
            aria-hidden
          />
        ) : null}
        <span className="mt-0.5 shrink-0">{icon}</span>
        {showExpandedNav && (
          <span className="flex min-w-0 flex-col gap-0 leading-tight">
            <span>{label}</span>
            {sublabel ? (
              <span className="text-[10px] font-medium text-[var(--flux-text-muted)]/90">{sublabel}</span>
            ) : null}
          </span>
        )}
      </Link>
    );
    if (compactMode) {
      return (
        <CustomTooltip content={hint} position="right">
          {body}
        </CustomTooltip>
      );
    }
    return body;
  }

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
        {...(layout === "mobile" ? drawerProps : {})}
        role={layout === "mobile" && mobileOpen ? "dialog" : undefined}
        aria-modal={layout === "mobile" && mobileOpen ? true : undefined}
        aria-label={layout === "mobile" && mobileOpen ? t("menu.navigationPanel") : undefined}
        aria-hidden={mobileClosed || undefined}
        onMouseEnter={() => layout === "tablet" && setTabletHover(true)}
        onMouseLeave={() => layout === "tablet" && setTabletHover(false)}
        className={`flex shrink-0 flex-col overflow-hidden transition-[width,transform] duration-300 ease-out
          ${isMinimal
            ? "border-r border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-surface-dark)]/92 backdrop-blur-sm"
            : "border-r border-[var(--flux-primary-alpha-10)] bg-[linear-gradient(180deg,var(--flux-surface-dark),color-mix(in_srgb,var(--flux-surface-dark)_88%,var(--flux-primary)_12%))] backdrop-blur-md"
          }
          max-md:fixed max-md:left-0 max-md:top-0 max-md:z-[var(--flux-z-sidebar-drawer)] max-md:h-[100dvh] max-md:max-h-[100dvh] max-md:w-[min(280px,calc(100vw-24px))] max-md:shadow-[var(--flux-shadow-lg)]
          max-md:-translate-x-full max-md:pointer-events-none max-md:data-[open]:translate-x-0 max-md:data-[open]:pointer-events-auto
          md:relative md:z-auto md:h-full md:min-h-0 md:translate-x-0 md:pointer-events-auto md:shadow-none`}
        style={
          layout === "mobile"
            ? undefined
            : {
                width: sidebarWidth,
              }
        }
        data-open={layout === "mobile" && mobileOpen ? "" : undefined}
      >
        <div
          className={`flex h-12 shrink-0 items-center gap-1.5 border-b px-2.5 ${
            isMinimal ? "border-[var(--flux-chrome-alpha-08)]" : "border-[var(--flux-primary-alpha-08)]"
          } ${compactMode ? "justify-center" : "justify-between"}`}
        >
          <Link
            href={`/${locale}/boards`}
            onClick={() => layout === "mobile" && closeMobile()}
            className={`flex min-w-0 items-center ${compactMode ? "shrink-0 justify-center" : "gap-2"}`}
          >
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-[var(--flux-rad-sm)] text-white"
              style={{
                background: orgLogoUrl
                  ? "var(--flux-surface-elevated)"
                  : "linear-gradient(135deg, var(--flux-primary), var(--flux-primary-dark))",
                boxShadow: orgLogoUrl ? "none" : "0 2px 8px var(--flux-primary-alpha-25)",
              }}
            >
              {orgLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={orgLogoUrl} alt="" className="max-h-[28px] max-w-[28px] object-contain" />
              ) : (
                <FluxLogoIcon className="h-4 w-4" />
              )}
            </div>
            {showExpandedNav && (
              <span className="truncate font-display text-sm font-bold text-[var(--flux-text)]">{platformName}</span>
            )}
          </Link>
          {layout === "desktop" ? (
            <button
              type="button"
              onClick={toggleDesktopCollapsed}
              className="shrink-0 rounded-[var(--flux-rad-sm)] p-1.5 text-[var(--flux-text-muted)] transition-colors hover:bg-[var(--flux-primary-alpha-08)] hover:text-[var(--flux-text)]"
              aria-label={collapsed ? t("menu.expand") : t("menu.collapse")}
            >
              {collapsed ? <IconChevronRight className="h-4 w-4" /> : <IconChevronLeft className="h-4 w-4" />}
            </button>
          ) : layout === "mobile" ? (
            <button
              type="button"
              onClick={closeMobile}
              className="shrink-0 rounded-[var(--flux-rad-sm)] p-1.5 text-[var(--flux-text-muted)] transition-colors hover:bg-[var(--flux-primary-alpha-08)] hover:text-[var(--flux-text)]"
              aria-label={t("menu.closeNavigation")}
            >
              <IconClose className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <nav className="flex min-h-0 min-w-0 flex-1 flex-col gap-1 overflow-x-hidden overflow-y-auto overscroll-contain px-2.5 py-3">
          <NavSectionTitle>{t("section.work")}</NavSectionTitle>
          <NavLink
            path="/boards"
            hint={t("hints.boards")}
            icon={<IconBoards className="h-4 w-4 shrink-0" />}
            label={t("boards")}
          />
          <NavLink
            path="/templates"
            hint={t("hints.templates")}
            icon={<IconTemplates className="h-4 w-4 shrink-0" />}
            label={t("templates")}
          />
          <NavLink
            path="/tasks"
            hint={t("hints.tasks")}
            icon={<IconTasks className="h-4 w-4 shrink-0" />}
            label={t("tasks")}
          />
          <NavLink
            path="/my-work"
            hint={t("hints.myWork")}
            icon={
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            }
            label={t("myWork")}
          />
          <NavLink
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
          <NavLink
            path="/program-increments"
            hint={t("hints.programIncrements")}
            icon={<IconProgramIncrements className="h-4 w-4 shrink-0" />}
            label={t("programIncrements")}
          />

          <NavSectionTitle>{t("section.intelligence")}</NavSectionTitle>
          <NavLink
            path="/reports"
            hint={t("hints.reports")}
            icon={<IconReports className="h-4 w-4 shrink-0" />}
            label={t("reports")}
            sublabel={t("reportsProduct")}
            dataTour="board-reports"
          />
          {(user?.isAdmin || user?.isExecutive) && (
            <NavLink
              path="/dashboard"
              hint={t("hints.dashboard")}
              icon={<IconExecutiveDashboard className="h-4 w-4 shrink-0" />}
              label={t("dashboard")}
              sublabel={t("dashboardProduct")}
            />
          )}
          <NavLink
            path="/okrs"
            hint={t("hints.okrs")}
            icon={<IconGoals className="h-4 w-4 shrink-0" />}
            label={t("okrs")}
          />
          <NavLink
            path="/docs"
            hint={t("hints.docs")}
            icon={<IconDocs className="h-4 w-4 shrink-0" />}
            label={t("docs")}
          />
          {user?.isAdmin && (
            <NavLink
              path="/negocios"
              hint={t("hints.business")}
              icon={<IconBriefcase className="h-4 w-4 shrink-0" />}
              label={t("business")}
            />
          )}

          {user?.isAdmin && (
            <>
              <NavSectionTitle>{t("section.admin")}</NavSectionTitle>
              <NavLink
                path="/equipe"
                hint={t("hints.users")}
                icon={<IconTeam className="h-4 w-4 shrink-0" />}
                label="Equipe"
                sublabel={t("teamWorkspace")}
              />
              {/* People */}
              <NavLink
                path="/users"
                hint={t("hints.users")}
                icon={<IconUsers className="h-4 w-4 shrink-0" />}
                label={t("users")}
                sublabel={t("userDirectory")}
              />
              <NavLink
                path="/org-invites"
                hint={
                  activeInvites !== null && activeInvites > 0
                    ? `${t("hints.invites")} (${activeInvites})`
                    : t("hints.invites")
                }
                icon={<IconInvites className="h-4 w-4 shrink-0" />}
                label={t("invites")}
                sublabel={
                  activeInvites !== null && activeInvites > 0
                    ? String(activeInvites)
                    : undefined
                }
              />
              {/* Settings */}
              <div className="h-[6px]" />
              <NavLink
                path="/org-settings"
                hint={t("hints.organization")}
                icon={<IconSettings className="h-4 w-4 shrink-0" />}
                label={t("organization")}
              />
              <NavLink
                path="/billing"
                hint={t("hints.billing")}
                icon={<IconBilling className="h-4 w-4 shrink-0" />}
                label={t("billing")}
              />
              {/* Ops */}
              <div className="h-[6px]" />
              <NavLink
                path="/rate-limit-abuse"
                hint={t("hints.rateLimitAbuse")}
                icon={<IconShield className="h-4 w-4 shrink-0" />}
                label={t("rateLimitAbuse")}
              />
              <NavLink
                path="/admin/tracer"
                hint={t("hints.tracer")}
                icon={<IconTracer className="h-4 w-4 shrink-0" />}
                label={t("tracer")}
              />
            </>
          )}
        </nav>

        <div
          className={`flex shrink-0 flex-col gap-1 border-t p-2.5 ${
            isMinimal ? "border-[var(--flux-chrome-alpha-08)]" : "border-[var(--flux-primary-alpha-08)]"
          }`}
        >
          {showExpandedNav ? (
            <div
              className={`flex rounded-[var(--flux-rad-sm)] border p-0.5 ${
                isMinimal ? "border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-black-alpha-04)]" : "border-[var(--flux-primary-alpha-12)] bg-[var(--flux-black-alpha-04)]"
              }`}
              role="group"
              aria-label={t("variant.toggleTooltip")}
            >
              <button
                type="button"
                onClick={() => navActions?.setVariant("aurora")}
                className={`flex-1 rounded-[calc(var(--flux-rad-sm)-2px)] px-2 py-1.5 text-[11px] font-semibold transition-all ${
                  navVariant === "aurora"
                    ? "bg-[var(--flux-primary-alpha-18)] text-[var(--flux-primary-light)]"
                    : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
                }`}
              >
                {t("variant.aurora")}
              </button>
              <button
                type="button"
                onClick={() => navActions?.setVariant("minimal")}
                className={`flex-1 rounded-[calc(var(--flux-rad-sm)-2px)] px-2 py-1.5 text-[11px] font-semibold transition-all ${
                  navVariant === "minimal"
                    ? "bg-[var(--flux-primary-alpha-18)] text-[var(--flux-primary-light)]"
                    : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
                }`}
              >
                {t("variant.minimal")}
              </button>
            </div>
          ) : (
            <CustomTooltip content={t("variant.cycleTooltip", { current: variantLabel })} position="right">
              <button
                type="button"
                onClick={() => navActions?.toggleVariant()}
                aria-label={t("variant.cycleTooltip", { current: variantLabel })}
                className={`flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-[var(--flux-rad-sm)] px-2.5 py-2 font-display text-sm font-semibold transition-all
                  text-[var(--flux-text-muted)] hover:bg-[var(--flux-primary-alpha-06)] hover:text-[var(--flux-primary)]`}
              >
                <IconNavStyle className="h-4 w-4 shrink-0" />
              </button>
            </CustomTooltip>
          )}
          <CustomTooltip
            content={t("theme.cycleTooltip", { current: themeModeLabel })}
            position="right"
          >
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
            onClick={logout}
            className={`${linkClass("")} text-[var(--flux-danger)] hover:!bg-[var(--flux-danger-alpha-12)] hover:!text-[var(--flux-danger)]`}
          >
            <IconLogout className="h-4 w-4 shrink-0" />
            {showExpandedNav && <span>{t("logout")}</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
