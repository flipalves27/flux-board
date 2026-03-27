"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

type Props = {
  localeRoot: string;
  isExec: boolean;
};

export function FluxAiHub({ localeRoot, isExec }: Props) {
  const t = useTranslations("fluxAiHub");

  const reportsHref = `${localeRoot}/reports`;

  return (
    <section className="mb-6 rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-28)] bg-[var(--flux-surface-card)] p-4" aria-labelledby="flux-ai-hub-title">
      <h2 id="flux-ai-hub-title" className="font-display text-sm font-bold text-[var(--flux-text)]">
        {t("title")}
      </h2>
      <p className="mt-1 max-w-3xl text-xs text-[var(--flux-text-muted)]">{t("subtitle")}</p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {isExec ? (
          <Link
            href={`${localeRoot}/dashboard`}
            className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-surface-dark)] px-3 py-3 text-left transition-colors hover:border-[var(--flux-primary-alpha-35)]"
          >
            <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--flux-primary-light)]">{t("cards.exec.badge")}</p>
            <p className="mt-1 text-sm font-semibold text-[var(--flux-text)]">{t("cards.exec.title")}</p>
            <p className="mt-1 text-[11px] text-[var(--flux-text-muted)]">{t("cards.exec.desc")}</p>
          </Link>
        ) : null}
        <Link
          href={`${localeRoot}/docs`}
          className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-surface-dark)] px-3 py-3 text-left transition-colors hover:border-[var(--flux-primary-alpha-35)]"
        >
          <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--flux-secondary)]">{t("cards.docs.badge")}</p>
          <p className="mt-1 text-sm font-semibold text-[var(--flux-text)]">{t("cards.docs.title")}</p>
          <p className="mt-1 text-[11px] text-[var(--flux-text-muted)]">{t("cards.docs.desc")}</p>
        </Link>
        <Link
          href={reportsHref}
          className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-surface-dark)] px-3 py-3 text-left transition-colors hover:border-[var(--flux-primary-alpha-35)]"
        >
          <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--flux-warning-foreground)]">{t("cards.forecast.badge")}</p>
          <p className="mt-1 text-sm font-semibold text-[var(--flux-text)]">{t("cards.forecast.title")}</p>
          <p className="mt-1 text-[11px] text-[var(--flux-text-muted)]">{t("cards.forecast.desc")}</p>
        </Link>
        <div className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-surface-dark)] px-3 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--flux-teal-brand)]">{t("cards.copilot.badge")}</p>
          <p className="mt-1 text-sm font-semibold text-[var(--flux-text)]">{t("cards.copilot.title")}</p>
          <p className="mt-1 text-[11px] text-[var(--flux-text-muted)]">{t("cards.copilot.desc")}</p>
        </div>
      </div>
    </section>
  );
}
