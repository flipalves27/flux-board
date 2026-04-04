"use client";

import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";

const STORAGE_COLLAPSED = "flux-docs-hint-collapsed";

export function DocsEditorHint() {
  const t = useTranslations("docsPage.hint");
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STORAGE_COLLAPSED) === "1";
  });

  const toggle = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try {
        window.localStorage.setItem(STORAGE_COLLAPSED, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return (
    <div className="mb-3 rounded-[var(--flux-rad-xl)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-card)] p-4 shadow-[var(--flux-shadow-elevated-card)]">
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-semibold text-[var(--flux-text)]">{t("title")}</div>
        <button type="button" onClick={toggle} className="shrink-0 text-xs text-[var(--flux-primary-light)] hover:underline">
          {collapsed ? t("expand") : t("collapse")}
        </button>
      </div>
      {!collapsed ? (
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-[var(--flux-text-muted)]">
          <li>{t("step1")}</li>
          <li>{t("step2")}</li>
          <li>{t("step3")}</li>
          <li>{t("step4")}</li>
        </ol>
      ) : null}
    </div>
  );
}

const STORAGE_AI_BANNER = "flux-docs-ai-banner-dismissed";

export function DocsAiBanner({ contentEmpty }: { contentEmpty: boolean }) {
  const t = useTranslations("docsPage.aiBanner");
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(STORAGE_AI_BANNER) === "1";
  });

  if (dismissed || !contentEmpty) return null;

  return (
    <div className="mb-3 flex items-start justify-between gap-3 rounded-lg border border-[var(--flux-primary-alpha-15)] bg-[var(--flux-primary-alpha-08)] px-3 py-2 text-sm text-[var(--flux-text)]">
      <p className="min-w-0 flex-1 leading-relaxed">{t("body")}</p>
      <button
        type="button"
        className="shrink-0 text-xs font-medium text-[var(--flux-primary-light)] hover:underline"
        onClick={() => {
          try {
            window.localStorage.setItem(STORAGE_AI_BANNER, "1");
          } catch {
            /* ignore */
          }
          setDismissed(true);
        }}
      >
        {t("dismiss")}
      </button>
    </div>
  );
}
