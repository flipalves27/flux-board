"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

type ItemKey = "triage" | "copilot" | "timeline" | "portal" | "automations" | "reports";

function IconSpark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2m0 14v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M3 12h2m14 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconChat({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}

function IconCalendar({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function IconGlobe({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function IconZap({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function IconChart({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

const ICONS: Record<ItemKey, ComponentType<{ className?: string }>> = {
  triage: IconSpark,
  copilot: IconChat,
  timeline: IconCalendar,
  portal: IconGlobe,
  automations: IconZap,
  reports: IconChart,
};

export function FluxCapabilityStrip() {
  const t = useTranslations("boards.capabilityStrip");
  const locale = useLocale();
  const localeRoot = `/${locale}`;
  const items: ItemKey[] = ["triage", "copilot", "timeline", "portal", "automations", "reports"];

  return (
    <section
      className="mb-6 rounded-[var(--flux-rad-lg)] border border-[var(--flux-primary-alpha-14)] bg-[linear-gradient(135deg,var(--flux-primary-alpha-07),var(--flux-secondary-alpha-04))] p-4 sm:p-5"
      aria-labelledby="flux-capability-title"
    >
      <div className="mb-4 max-w-3xl">
        <h3 id="flux-capability-title" className="font-display text-sm font-bold text-[var(--flux-text)]">
          {t("title")}
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-[var(--flux-text-muted)]">{t("subtitle")}</p>
      </div>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((key) => {
          const Icon = ICONS[key];
          const isReports = key === "reports";
          const inner = (
            <div
              className={`flex h-full gap-3 rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-06)] bg-[var(--flux-surface-card)]/90 p-3 text-left transition-all duration-200 ease-out ${
                isReports
                  ? "hover:border-[var(--flux-primary-alpha-45)] hover:shadow-[0_8px_24px_var(--flux-primary-alpha-12)]"
                  : "hover:border-[var(--flux-primary-alpha-22)]"
              }`}
            >
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--flux-rad-sm)] ${
                  isReports
                    ? "bg-[var(--flux-primary-alpha-20)] text-[var(--flux-primary-light)]"
                    : "bg-[var(--flux-chrome-alpha-04)] text-[var(--flux-secondary)]"
                }`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display text-xs font-bold text-[var(--flux-text)]">{t(`${key}.name`)}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-[var(--flux-text-muted)]">{t(`${key}.hint`)}</p>
                {isReports ? (
                  <p className="mt-2 text-[11px] font-semibold text-[var(--flux-primary-light)]">{t("reports.cta")} →</p>
                ) : null}
              </div>
            </div>
          );

          if (isReports) {
            return (
              <li key={key}>
                <Link href={`${localeRoot}/reports`} className="block outline-none focus-visible:ring-2 focus-visible:ring-[var(--flux-primary)] rounded-[var(--flux-rad)]">
                  {inner}
                </Link>
              </li>
            );
          }

          return <li key={key}>{inner}</li>;
        })}
      </ul>
    </section>
  );
}
