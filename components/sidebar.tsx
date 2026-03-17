"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { useTheme } from "@/context/theme-context";

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

function IconUsers({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
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
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);

  const isActive = (href: string) => {
    if (href === "/boards") return pathname === "/boards";
    if (href === "/discovery") return pathname.startsWith("/discovery");
    if (href === "/users") return pathname === "/users";
    return pathname === href;
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
        <Link href="/boards" className={`flex items-center min-w-0 ${collapsed ? "justify-center shrink-0" : "gap-2"}`}>
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
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
        >
          {collapsed ? <IconChevronRight className="w-4 h-4" /> : <IconChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2.5 flex flex-col gap-0.5 min-w-0">
        <Link href="/boards" className={linkClass("/boards")}>
          <IconBoards className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Boards</span>}
        </Link>
        <Link href="/discovery/garantia-ia-propostas" className={linkClass("/discovery")}>
          <IconDiscovery className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Discovery</span>}
        </Link>
        {user?.isAdmin && (
          <Link href="/users" className={linkClass("/users")}>
            <IconUsers className="w-4 h-4 shrink-0" />
            {!collapsed && <span>Usuários</span>}
          </Link>
        )}
      </nav>

      {/* Theme + Logout */}
      <div className="p-2.5 border-t border-[rgba(108,92,231,0.06)] flex flex-col gap-0.5 shrink-0">
        <button
          type="button"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className={`flex items-center gap-2.5 w-full px-2.5 py-2 rounded-[var(--flux-rad-sm)] font-semibold text-sm transition-all font-display overflow-hidden
            bg-transparent text-[var(--flux-text-muted)] hover:bg-[rgba(108,92,231,0.06)] hover:text-[var(--flux-primary)]`}
          title={theme === "dark" ? "Usar tema claro" : "Usar tema escuro"}
        >
          {theme === "dark" ? <IconSun className="w-4 h-4 shrink-0" /> : <IconMoon className="w-4 h-4 shrink-0" />}
          {!collapsed && <span>{theme === "dark" ? "Tema claro" : "Tema escuro"}</span>}
        </button>
        <button
          type="button"
          onClick={logout}
          className={`${linkClass("")} text-[var(--flux-danger)] hover:!bg-[rgba(255,107,107,0.12)] hover:!text-[var(--flux-danger)]`}
        >
          <IconLogout className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Sair</span>}
        </button>
      </div>
    </aside>
  );
}
