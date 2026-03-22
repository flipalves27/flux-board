"use client";

import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import { useTranslations } from "next-intl";
import { AnomalyNotificationBell } from "@/components/anomaly-notification-bell";
import { useOrgBranding, usePlatformDisplayName } from "@/context/org-branding-context";
import { useTheme } from "@/context/theme-context";

interface HeaderProps {
  title?: string;
  /** Linha secundária (ex.: rótulo do cliente no board). */
  titleLine2?: string;
  /** Quando true, agrupa título + linha 2 para o tour guiado (`data-tour`). */
  boardTourHeader?: boolean;
  backHref?: string;
  backLabel?: string;
  hideDiscovery?: boolean;
  children?: React.ReactNode;
}

export function Header({
  title,
  titleLine2,
  boardTourHeader,
  backHref,
  backLabel = "← Boards",
  hideDiscovery,
  children,
}: HeaderProps) {
  const { user } = useAuth();
  const t = useTranslations("header");
  const platformName = usePlatformDisplayName();
  const orgBranding = useOrgBranding();
  const logoUrl = orgBranding?.effectiveBranding?.logoUrl?.trim();
  const defaultTitle = platformName;
  const resolvedTitle = title ?? defaultTitle;
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="bg-[var(--flux-surface-mid)] border-b border-[var(--flux-primary-alpha-12)] sticky top-0 z-[200]">
      <div className="w-full px-5 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          {backHref && (
            <Link
              href={backHref}
              className="text-[var(--flux-text-muted)] text-sm no-underline hover:text-[var(--flux-primary-light)] transition-colors"
            >
              {backLabel}
            </Link>
          )}
          {boardTourHeader ? (
            <div data-tour="board-header" className="min-w-0 flex flex-col gap-0.5">
              <h1 className="font-display font-bold text-base tracking-tight text-[var(--flux-text)] flex items-center gap-2 min-w-0">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="" className="h-7 w-auto max-w-[140px] object-contain shrink-0" />
                ) : null}
                <span
                  className="bg-clip-text text-transparent min-w-0 truncate"
                  style={{
                    backgroundImage: "linear-gradient(135deg, var(--flux-text) 0%, var(--flux-primary-light) 100%)",
                  }}
                >
                  {platformName}
                </span>
                {resolvedTitle && resolvedTitle !== platformName && (
                  <span className="text-[var(--flux-text-muted)] font-medium truncate"> — {resolvedTitle}</span>
                )}
              </h1>
              {titleLine2 ? (
                <p className="text-xs text-[var(--flux-text-muted)] truncate max-w-[min(560px,70vw)]">{titleLine2}</p>
              ) : null}
            </div>
          ) : (
            <h1 className="font-display font-bold text-base tracking-tight text-[var(--flux-text)] flex items-center gap-2 min-w-0">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" className="h-7 w-auto max-w-[140px] object-contain shrink-0" />
              ) : null}
              <span
                className="bg-clip-text text-transparent min-w-0 truncate"
                style={{
                  backgroundImage: "linear-gradient(135deg, var(--flux-text) 0%, var(--flux-primary-light) 100%)",
                }}
              >
                {platformName}
              </span>
              {resolvedTitle && resolvedTitle !== platformName && (
                <span className="text-[var(--flux-text-muted)] font-medium truncate"> — {resolvedTitle}</span>
              )}
            </h1>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {user && (
            <span className="text-xs text-[var(--flux-text-muted)]">
              {user.name || user.username || t("userFallback")}
            </span>
          )}
          {user ? <AnomalyNotificationBell /> : null}
          <button
            type="button"
            onClick={toggleTheme}
            className="h-7 w-7 rounded-full border border-[var(--flux-chrome-alpha-10)] text-[var(--flux-text-muted)] flex items-center justify-center hover:bg-[var(--flux-chrome-alpha-06)] transition-colors"
            aria-label={theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro"}
            title={theme === "dark" ? "Tema claro" : "Tema escuro"}
          >
            {theme === "dark" ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5" aria-hidden>
                <circle cx="12" cy="12" r="5" /><path strokeLinecap="round" d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5" aria-hidden>
                <path strokeLinecap="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
              </svg>
            )}
          </button>
          {children}
        </div>
      </div>
    </header>
  );
}
