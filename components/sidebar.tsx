"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
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

function IconDiscovery({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
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

function IconInvites({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12c0 8-9 13-9 13S3 20 3 12a9 9 0 1118 0z" />
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
    if (href === "/discovery") return normalizedPath.startsWith("/discovery");
    if (href === "/tasks") return normalizedPath.startsWith("/tasks");
    if (href === "/users") return normalizedPath === "/users";
    if (href === "/org-settings") return normalizedPath === "/org-settings";
    if (href === "/org-invites") return normalizedPath === "/org-invites";
    return normalizedPath === href;
  };

  const linkClass = (href: string) =>
    `flex items-center gap-2.5 w-full px-2.5 py-2 rounded-[var(--flux-rad-sm)] font-semibold text-sm transition-all duration-200 font-display overflow-hidden
     ${isActive(href)
       ? "bg-[rgba(108,92,231,0.2)] text-[var(--flux-primary-light)] shadow-none"
       : "text-[var(--flux-text-muted)] hover:bg-[rgba(108,92,231,0.06)] hover:text-[var(--flux-text)]"
     }`;

  return (
    <aside
      className="flex flex-col shrink-0 border-r border-[rgba(108,92,231,0.08)] bg-[var(--flux-surface-dark)]/80 backdrop-blur-sm transition-[width] duration-300 ease-out overflow-hidden"
      style={{ width: collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED }}
    >
      {/* Logo + toggle — ícone sempre visível; quando recolhido mantém uma linha para não cortar o ícone */}
      <div className={`flex items-center gap-1.5 h-11 px-2.5 border-b border-[rgba(108,92,231,0.06)] shrink-0 ${collapsed ? "justify-center" : "justify-between"}`}>
        <Link href={`/${locale}/boards`} className={`flex items-center min-w-0 ${collapsed ? "justify-center shrink-0" : "gap-2"}`}>
          <div
            className="w-8 h-8 rounded-[var(--flux-rad-sm)] flex items-center justify-center shrink-0 text-white"
            style={{
              background: "linear-gradient(135deg, var(--flux-primary), var(--flux-primary-dark))",
              boxShadow: "0 2px 8px rgba(108,92,231,0.25)",
            }}
          >
            <FluxLogoIcon className="w-4 h-4" />
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
      <nav className="flex-1 py-3 px-2.5 flex flex-col gap-0.5 min-w-0">
        <Link href={`/${locale}/boards`} className={linkClass("/boards")}>
          <IconBoards className="w-4 h-4 shrink-0" />
          {!collapsed && <span>{t("boards")}</span>}
        </Link>
        <Link href={`/${locale}/discovery`} className={linkClass("/discovery")}>
          <IconDiscovery className="w-4 h-4 shrink-0" />
          {!collapsed && <span>{t("discovery")}</span>}
        </Link>
        <Link href={`/${locale}/tasks`} className={linkClass("/tasks")}>
          <IconTasks className="w-4 h-4 shrink-0" />
          {!collapsed && <span>{t("tasks")}</span>}
        </Link>
        {user?.isAdmin && (
          <Link href={`/${locale}/users`} className={linkClass("/users")}>
            <IconUsers className="w-4 h-4 shrink-0" />
            {!collapsed && <span>{t("users")}</span>}
          </Link>
        )}
        {user?.isAdmin && (
          <Link href={`/${locale}/org-settings`} className={linkClass("/org-settings")}>
            <IconSettings className="w-4 h-4 shrink-0" />
            {!collapsed && <span>{t("organization")}</span>}
          </Link>
        )}
        {user?.isAdmin && (
          <Link href={`/${locale}/org-invites`} className={linkClass("/org-invites")}>
            <IconInvites className="w-4 h-4 shrink-0" />
            {!collapsed && <span>{t("invites")}</span>}
            {activeInvites !== null && activeInvites > 0 && (
              <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--flux-primary)] text-white">
                {activeInvites}
              </span>
            )}
          </Link>
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
