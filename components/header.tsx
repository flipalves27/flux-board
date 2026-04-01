"use client";

import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import { useTranslations } from "next-intl";
import { AnomalyNotificationBell } from "@/components/anomaly-notification-bell";
import { useOrgBranding, usePlatformDisplayName } from "@/context/org-branding-context";
import { useSidebarLayoutOptional } from "@/context/sidebar-layout-context";
import { useNavigationVariant } from "@/context/navigation-variant-context";

interface HeaderProps {
  title?: string;
  /** Linha secundária (ex.: rótulo do cliente no board). */
  titleLine2?: string;
  /** Quando true, agrupa título + linha 2 para o tour guiado (`data-tour`). */
  boardTourHeader?: boolean;
  backHref?: string;
  backLabel?: string;
  children?: React.ReactNode;
}

function IconMenu({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function IconChevronRight({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function Header({
  title,
  titleLine2,
  boardTourHeader,
  backHref,
  backLabel = "← Boards",
  children,
}: HeaderProps) {
  const { user } = useAuth();
  const t = useTranslations("header");
  const platformName = usePlatformDisplayName();
  const orgBranding = useOrgBranding();
  const logoUrl = orgBranding?.effectiveBranding?.logoUrl?.trim();
  const defaultTitle = platformName;
  const resolvedTitle = title ?? defaultTitle;
  const sidebarCtx = useSidebarLayoutOptional();
  const isMobile = sidebarCtx?.layout === "mobile";
  const navVariant = useNavigationVariant();
  const isMinimalNav = navVariant === "minimal";

  return (
    <header
      className={`sticky top-0 z-[var(--flux-z-header-sticky)] flux-glass-surface rounded-none border-x-0 border-t-0 flux-depth-2 ${
        isMinimalNav ? "border-b-[var(--flux-glass-surface-border)]" : "border-b-[var(--flux-glass-elevated-border)]"
      }`}
    >
      <div className="w-full px-5 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          {isMobile && sidebarCtx && (
            <button
              type="button"
              onClick={sidebarCtx.openMobile}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--flux-rad-sm)] text-[var(--flux-text)] transition-colors hover:bg-[var(--flux-primary-alpha-08)] md:hidden"
              aria-label={t("openNavigation")}
              aria-haspopup="dialog"
              aria-expanded={sidebarCtx.mobileOpen}
            >
              <IconMenu className="h-5 w-5" />
            </button>
          )}
          {backHref &&
            (isMinimalNav ? (
              <div className="flex min-w-0 items-center gap-2 text-xs">
                <Link
                  href={backHref}
                  className="shrink-0 font-medium text-[var(--flux-text-muted)] no-underline transition-colors hover:text-[var(--flux-primary-light)]"
                >
                  {backLabel}
                </Link>
                {resolvedTitle ? (
                  <>
                    <span className="shrink-0 text-[var(--flux-text-muted)]/45" aria-hidden>
                      /
                    </span>
                    <span
                      className="min-w-0 max-w-[min(320px,46vw)] truncate font-display font-semibold bg-clip-text text-transparent"
                      style={{
                        backgroundImage:
                          "linear-gradient(135deg, var(--flux-text) 0%, var(--flux-primary-light) 100%)",
                      }}
                    >
                      {resolvedTitle}
                    </span>
                  </>
                ) : null}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 rounded-full border border-[var(--flux-primary-alpha-15)] bg-[var(--flux-primary-alpha-06)] px-2 py-1">
                <Link
                  href={backHref}
                  className="text-[11px] font-semibold text-[var(--flux-text-muted)] no-underline transition-colors hover:text-[var(--flux-primary-light)]"
                >
                  {backLabel}
                </Link>
                {resolvedTitle ? (
                  <>
                    <IconChevronRight className="h-3.5 w-3.5 text-[var(--flux-text-muted)]/70" />
                    <span
                      className="max-w-[300px] truncate text-[11px] font-display font-semibold bg-clip-text text-transparent"
                      style={{
                        backgroundImage:
                          "linear-gradient(135deg, var(--flux-text) 0%, var(--flux-primary-light) 100%)",
                      }}
                    >
                      {resolvedTitle}
                    </span>
                  </>
                ) : null}
              </div>
            ))}
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
                {resolvedTitle && resolvedTitle !== platformName && !backHref && (
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
              {resolvedTitle && resolvedTitle !== platformName && !backHref && (
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
          {children}
        </div>
      </div>
    </header>
  );
}
