"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { useOrgBranding } from "@/context/org-branding-context";
import { useTheme } from "@/context/theme-context";
import { CustomTooltip } from "@/components/ui/custom-tooltip";
import { apiGet, ApiError } from "@/lib/api-client";

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
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
    </svg>
  );
}

function IconReports({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

function IconDiscovery({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function IconTemplates({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
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

function IconUsers({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
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
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
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

const SIDEBAR_WIDTH_EXPANDED = 260;
const SIDEBAR_WIDTH_COLLAPSED = 72;

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout, isChecked, getHeaders } = useAuth();
  const orgBrandingCtx = useOrgBranding();
  const orgLogoUrl = orgBrandingCtx?.branding?.logoUrl?.trim();
  const { theme, setTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const t = useTranslations("navigation");

  const [activeInvites, setActiveInvites] = useState<number | null>(null);

  const localeSegment = pathname.split("/")[1];
  const locale = localeSegment === "en" ? "en" : "pt-BR";
  const normalizedPath = pathname.replace(/^\/(pt-BR|en)(?=\/|$)/, "") || "/";

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

  const isActive = (href: string) => {
    if (href === "/boards") return normalizedPath === "/boards";
    if (href === "/reports") return normalizedPath === "/reports";
    if (href === "/okrs") return normalizedPath === "/okrs";
    if (href === "/discovery") return normalizedPath.startsWith("/discovery");
    if (href === "/templates") return normalizedPath.startsWith("/templates");
    if (href === "/tasks") return normalizedPath.startsWith("/tasks");
    if (href === "/users") return normalizedPath === "/users";
    if (href === "/billing") return normalizedPath === "/billing";
    if (href === "/org-settings") return normalizedPath === "/org-settings";
    if (href === "/org-invites") return normalizedPath === "/org-invites";
    return normalizedPath === href;
  };

  const linkClass = (href: string) =>
    `flex items-center gap-2.5 w-full px-2.5 py-2 rounded-[var(--flux-rad-sm)] font-semibold text-sm transition-all duration-200 ease-out font-display overflow-hidden
     ${isActive(href)
       ? "bg-[rgba(108,92,231,0.2)] text-[var(--flux-primary-light)] shadow-none"
       : "text-[var(--flux-text-muted)] hover:bg-[rgba(108,92,231,0.06)] hover:text-[var(--flux-text)]"
     }`;

  function NavSectionTitle({ children }: { children: ReactNode }) {
    if (collapsed) return null;
    return (
      <div className="px-2.5 pt-3 first:pt-1 pb-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--flux-text-muted)]/65">
          {children}
        </span>
      </div>
    );
  }

  type NavLinkProps = {
    path: string;
    icon: React.ReactNode;
    label: React.ReactNode;
    hint: string;
    sublabel?: string;
  };

  function NavLink({ path, icon, label, hint, sublabel }: NavLinkProps) {
    const href = `/${locale}${path}`;
    const body = (
      <Link href={href} className={`${linkClass(path)} ${!collapsed && sublabel ? "items-start py-2.5" : ""}`}>
        <span className="mt-0.5 shrink-0">{icon}</span>
        {!collapsed && (
          <span className="flex min-w-0 flex-col gap-0 leading-tight">
            <span>{label}</span>
            {sublabel ? (
              <span className="text-[10px] font-medium text-[var(--flux-text-muted)]/90">{sublabel}</span>
            ) : null}
          </span>
        )}
      </Link>
    );
    if (collapsed) {
      return (
        <CustomTooltip content={hint} position="right">
          {body}
        </CustomTooltip>
      );
    }
    return body;
  }

  return (
    <aside
      className="flex flex-col shrink-0 border-r border-[rgba(108,92,231,0.08)] bg-[var(--flux-surface-dark)]/80 backdrop-blur-sm transition-[width] duration-300 ease-out overflow-hidden"
      style={{ width: collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED }}
    >
      {/* Logo + toggle — ícone sempre visível; quando recolhido mantém uma linha para não cortar o ícone */}
      <div className={`flex items-center gap-1.5 h-11 px-2.5 border-b border-[rgba(108,92,231,0.06)] shrink-0 ${collapsed ? "justify-center" : "justify-between"}`}>
        <Link href={`/${locale}/boards`} className={`flex items-center min-w-0 ${collapsed ? "justify-center shrink-0" : "gap-2"}`}>
          <div
            className="w-8 h-8 rounded-[var(--flux-rad-sm)] flex items-center justify-center shrink-0 text-white overflow-hidden"
            style={{
              background: orgLogoUrl
                ? "var(--flux-surface-elevated)"
                : "linear-gradient(135deg, var(--flux-primary), var(--flux-primary-dark))",
              boxShadow: orgLogoUrl ? "none" : "0 2px 8px rgba(108,92,231,0.25)",
            }}
          >
            {orgLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={orgLogoUrl} alt="" className="max-w-[28px] max-h-[28px] object-contain" />
            ) : (
              <FluxLogoIcon className="w-4 h-4" />
            )}
          </div>
          {!collapsed && <span className="font-display font-bold text-[var(--flux-text)] truncate text-sm">Flux-Board</span>}
        </Link>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="p-1.5 rounded-[var(--flux-rad-sm)] text-[var(--flux-text-muted)] hover:bg-[rgba(108,92,231,0.08)] hover:text-[var(--flux-text)] transition-colors shrink-0"
          aria-label={collapsed ? t("menu.expand") : t("menu.collapse")}
        >
          {collapsed ? <IconChevronRight className="w-4 h-4" /> : <IconChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2.5 flex flex-col gap-0.5 min-w-0 overflow-y-auto overflow-x-hidden">
        <NavSectionTitle>{t("section.flow")}</NavSectionTitle>
        <NavLink
          path="/boards"
          hint={t("hints.boards")}
          icon={<IconBoards className="w-4 h-4 shrink-0" />}
          label={t("boards")}
        />
        <NavLink
          path="/discovery"
          hint={t("hints.discovery")}
          icon={<IconDiscovery className="w-4 h-4 shrink-0" />}
          label={t("discovery")}
        />
        <NavLink
          path="/templates"
          hint={t("hints.templates")}
          icon={<IconTemplates className="w-4 h-4 shrink-0" />}
          label={t("templates")}
        />
        <NavLink
          path="/tasks"
          hint={t("hints.tasks")}
          icon={<IconTasks className="w-4 h-4 shrink-0" />}
          label={t("tasks")}
        />

        <NavSectionTitle>{t("section.intelligence")}</NavSectionTitle>
        <NavLink
          path="/reports"
          hint={t("hints.reports")}
          icon={<IconReports className="w-4 h-4 shrink-0" />}
          label={t("reports")}
          sublabel={t("reportsProduct")}
        />
        <NavLink
          path="/okrs"
          hint={t("hints.okrs")}
          icon={<IconGoals className="w-4 h-4 shrink-0" />}
          label={t("okrs")}
        />

        {user?.isAdmin && (
          <>
            <NavSectionTitle>{t("section.organization")}</NavSectionTitle>
            {collapsed ? (
              <CustomTooltip content={t("hints.users")} position="right">
                <Link href={`/${locale}/users`} className={linkClass("/users")}>
                  <IconUsers className="w-4 h-4 shrink-0" />
                </Link>
              </CustomTooltip>
            ) : (
              <NavLink
                path="/users"
                hint={t("hints.users")}
                icon={<IconUsers className="w-4 h-4 shrink-0" />}
                label={t("users")}
              />
            )}
            {collapsed ? (
              <CustomTooltip content={t("hints.organization")} position="right">
                <Link href={`/${locale}/org-settings`} className={linkClass("/org-settings")}>
                  <IconSettings className="w-4 h-4 shrink-0" />
                </Link>
              </CustomTooltip>
            ) : (
              <NavLink
                path="/org-settings"
                hint={t("hints.organization")}
                icon={<IconSettings className="w-4 h-4 shrink-0" />}
                label={t("organization")}
              />
            )}
            {collapsed ? (
              <CustomTooltip content={t("hints.billing")} position="right">
                <Link href={`/${locale}/billing`} className={linkClass("/billing")}>
                  <IconBilling className="w-4 h-4 shrink-0" />
                </Link>
              </CustomTooltip>
            ) : (
              <NavLink
                path="/billing"
                hint={t("hints.billing")}
                icon={<IconBilling className="w-4 h-4 shrink-0" />}
                label={t("billing")}
              />
            )}
            {collapsed ? (
              <CustomTooltip
                content={
                  activeInvites !== null && activeInvites > 0
                    ? `${t("hints.invites")} (${activeInvites})`
                    : t("hints.invites")
                }
                position="right"
              >
                <Link href={`/${locale}/org-invites`} className={`${linkClass("/org-invites")} relative`}>
                  <IconInvites className="w-4 h-4 shrink-0" />
                  {activeInvites !== null && activeInvites > 0 && (
                    <span className="absolute right-1.5 top-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-[var(--flux-primary)] text-[10px] font-bold text-white ring-2 ring-[var(--flux-surface-dark)]">
                      {activeInvites > 9 ? "9+" : activeInvites}
                    </span>
                  )}
                </Link>
              </CustomTooltip>
            ) : (
              <Link href={`/${locale}/org-invites`} className={linkClass("/org-invites")}>
                <IconInvites className="w-4 h-4 shrink-0" />
                <span>{t("invites")}</span>
                {activeInvites !== null && activeInvites > 0 && (
                  <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--flux-primary)] text-white">
                    {activeInvites}
                  </span>
                )}
              </Link>
            )}
          </>
        )}
      </nav>

      {/* Theme + Logout */}
      <div className="p-2.5 border-t border-[rgba(108,92,231,0.06)] flex flex-col gap-0.5 shrink-0">
        <CustomTooltip
          content={theme === "dark" ? t("theme.lightTooltip") : t("theme.darkTooltip")}
          position="right"
        >
          <button
            type="button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className={`flex items-center gap-2.5 w-full px-2.5 py-2 rounded-[var(--flux-rad-sm)] font-semibold text-sm transition-all font-display overflow-hidden
            bg-transparent text-[var(--flux-text-muted)] hover:bg-[rgba(108,92,231,0.06)] hover:text-[var(--flux-primary)]`}
          >
            {theme === "dark" ? <IconSun className="w-4 h-4 shrink-0" /> : <IconMoon className="w-4 h-4 shrink-0" />}
            {!collapsed && <span>{theme === "dark" ? t("theme.light") : t("theme.dark")}</span>}
          </button>
        </CustomTooltip>
        <button
          type="button"
          onClick={logout}
          className={`${linkClass("")} text-[var(--flux-danger)] hover:!bg-[rgba(255,107,107,0.12)] hover:!text-[var(--flux-danger)]`}
        >
          <IconLogout className="w-4 h-4 shrink-0" />
          {!collapsed && <span>{t("logout")}</span>}
        </button>
      </div>
    </aside>
  );
}
