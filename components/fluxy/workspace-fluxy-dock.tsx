"use client";

import { useCallback, useEffect, useId, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { FluxyAvatar } from "@/components/fluxy/fluxy-avatar";
import { AiAssistantIcon } from "@/components/icons/ai-assistant-icon";
import { useWorkspaceFluxyDockStore } from "@/stores/workspace-fluxy-dock-store";

function normalizeAppPath(pathname: string): string {
  return pathname.replace(/^\/(pt-BR|en)(?=\/|$)/, "") || "/";
}

function shouldRenderWorkspaceFluxy(normalizedPath: string): boolean {
  if (
    normalizedPath === "/" ||
    normalizedPath === "/login" ||
    normalizedPath.startsWith("/portal/") ||
    normalizedPath.startsWith("/forms/") ||
    normalizedPath.startsWith("/embed/")
  ) {
    return false;
  }
  if (/^\/board\/[^/]+/.test(normalizedPath)) return false;
  return true;
}

export function WorkspaceFluxyDock() {
  const pathname = usePathname();
  const locale = useLocale();
  const { user, isChecked } = useAuth();
  const t = useTranslations("appShell.workspaceFluxy");

  const hydrateFromStorage = useWorkspaceFluxyDockStore((s) => s.hydrateFromStorage);
  const dockVisible = useWorkspaceFluxyDockStore((s) => s.dockVisible);
  const hydrated = useWorkspaceFluxyDockStore((s) => s.hydrated);
  const setDockVisible = useWorkspaceFluxyDockStore((s) => s.setDockVisible);

  const [panelOpen, setPanelOpen] = useState(false);
  const titleId = useId();
  const localeRoot = `/${locale}`;

  useEffect(() => {
    hydrateFromStorage();
  }, [hydrateFromStorage]);

  const normalizedPath = normalizeAppPath(pathname);
  const show = isChecked && user && shouldRenderWorkspaceFluxy(normalizedPath);

  const closePanel = useCallback(() => setPanelOpen(false), []);

  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelOpen, closePanel]);

  useEffect(() => {
    if (!show) setPanelOpen(false);
  }, [show, pathname]);

  if (!show || !hydrated) return null;

  const bottom = "max(1rem, env(safe-area-inset-bottom, 0px))";
  const left = "max(1rem, env(safe-area-inset-left, 0px))";

  const openPanel = () => setPanelOpen(true);

  if (!dockVisible) {
    return (
      <div
        className="fixed z-[var(--flux-z-board-fluxy-dock)] motion-safe:transition-[transform,bottom] motion-safe:duration-200 max-md:max-w-[calc(100vw-2rem)]"
        style={{ bottom, left }}
      >
        <button
          type="button"
          onClick={() => setDockVisible(true)}
          className="inline-flex items-center gap-2 rounded-full border border-[var(--flux-primary-alpha-28)] bg-[var(--flux-surface-card)]/92 px-2.5 py-1.5 text-[10px] font-semibold text-[var(--flux-primary-light)] shadow-[var(--flux-shadow-md)] backdrop-blur-md hover:border-[var(--flux-primary)] hover:bg-[var(--flux-primary-alpha-10)]"
          aria-label={t("restoreAria")}
        >
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--flux-chrome-alpha-14)] bg-[var(--flux-void-nested-36)] text-[var(--flux-primary-light)]">
            <AiAssistantIcon className="h-3.5 w-3.5" />
          </span>
          {t("restore")}
        </button>
      </div>
    );
  }

  return (
    <>
      <div
        className="fixed z-[var(--flux-z-board-fluxy-dock)] flex max-w-[min(100vw-2rem,280px)] flex-col gap-1.5 motion-safe:transition-[transform,bottom] motion-safe:duration-200"
        style={{ bottom, left }}
      >
        <div className="flex items-center gap-1.5 rounded-2xl border border-[var(--flux-primary-alpha-22)] bg-[linear-gradient(135deg,var(--flux-primary-alpha-14),var(--flux-secondary-alpha-08))] py-1.5 pl-1.5 pr-1.5 shadow-[var(--flux-shadow-primary-panel)] backdrop-blur-md">
          <button
            type="button"
            onClick={openPanel}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-1 py-0.5 text-left hover:bg-[var(--flux-primary-alpha-08)] motion-safe:transition-colors"
            aria-expanded={panelOpen}
            aria-haspopup="dialog"
            aria-label={t("fabAria")}
          >
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--flux-chrome-alpha-14)] bg-[var(--flux-void-nested-36)] text-[var(--flux-primary-light)]">
              <AiAssistantIcon className="h-[18px] w-[18px]" />
            </span>
            <span className="min-w-0">
              <span className="block font-display text-xs font-bold leading-tight text-[var(--flux-text)]">{t("fabLabel")}</span>
              <span className="block text-[9px] leading-snug text-[var(--flux-text-muted)]">{t("fabHint")}</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setDockVisible(false)}
            className="btn-secondary shrink-0 px-2 py-1.5 text-[9px]"
            aria-label={t("hideDock")}
            title={t("hideDock")}
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
              />
            </svg>
          </button>
        </div>
      </div>

      {panelOpen ? (
        <div className="fixed inset-0 z-[var(--flux-z-fab-panel-backdrop)]">
          <button
            type="button"
            className="absolute inset-0 bg-[var(--flux-black-alpha-45)] backdrop-blur-[1px] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
            aria-label={t("closeBackdrop")}
            onClick={closePanel}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="absolute right-[max(1rem,env(safe-area-inset-right))] top-[max(5.5rem,env(safe-area-inset-top))] bottom-[max(1rem,env(safe-area-inset-bottom))] z-10 flex w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[var(--flux-rad)] border border-[var(--flux-border-subtle)] bg-[var(--flux-surface-card)] shadow-[0_18px_60px_var(--flux-black-alpha-45)] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-4 motion-safe:duration-200"
          >
            <div className="flex items-center justify-between gap-3 border-b border-[var(--flux-chrome-alpha-08)] px-4 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <FluxyAvatar state="waving" size="header" className="shrink-0 scale-90" title={t("panelTitle")} />
                <div className="min-w-0">
                  <h2 id={titleId} className="font-display text-sm font-bold leading-tight text-[var(--flux-primary-light)]">
                    {t("panelTitle")}
                  </h2>
                  <p className="text-[10px] text-[var(--flux-text-muted)]">{t("panelSubtitle")}</p>
                </div>
              </div>
              <button type="button" className="btn-secondary shrink-0 px-3 py-1.5 text-xs" onClick={closePanel}>
                {t("close")}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
              <p className="text-sm leading-relaxed text-[var(--flux-text)]">{t("intro")}</p>
              <p className="mt-3 text-xs leading-relaxed text-[var(--flux-text-muted)]">{t("boardHint")}</p>

              <p className="mt-5 text-[10px] font-bold uppercase tracking-wide text-[var(--flux-secondary)]">{t("linksHeading")}</p>
              <nav className="mt-2 flex flex-col gap-2" aria-label={t("linksNavAria")}>
                <Link
                  href={`${localeRoot}/boards`}
                  onClick={closePanel}
                  className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-3 py-2.5 text-center text-xs font-semibold text-[var(--flux-text)] transition-colors hover:border-[var(--flux-primary-alpha-35)] hover:text-[var(--flux-primary-light)]"
                >
                  {t("linkBoards")}
                </Link>
                <Link
                  href={`${localeRoot}/reports`}
                  onClick={closePanel}
                  className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-3 py-2.5 text-center text-xs font-semibold text-[var(--flux-text)] transition-colors hover:border-[var(--flux-primary-alpha-35)] hover:text-[var(--flux-primary-light)]"
                >
                  {t("linkReports")}
                </Link>
                <Link
                  href={`${localeRoot}/docs`}
                  onClick={closePanel}
                  className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-3 py-2.5 text-center text-xs font-semibold text-[var(--flux-text)] transition-colors hover:border-[var(--flux-primary-alpha-35)] hover:text-[var(--flux-primary-light)]"
                >
                  {t("linkDocs")}
                </Link>
                <Link
                  href={`${localeRoot}/org-settings`}
                  onClick={closePanel}
                  className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-3 py-2.5 text-center text-xs font-semibold text-[var(--flux-text)] transition-colors hover:border-[var(--flux-primary-alpha-35)] hover:text-[var(--flux-primary-light)]"
                >
                  {t("linkOrgSettings")}
                </Link>
              </nav>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
