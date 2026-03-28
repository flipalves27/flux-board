"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";

const TAB_KEYS = ["sales", "operations", "leadership"] as const;

export function LandingUseCases() {
  const t = useTranslations("landing");
  const baseId = useId();
  const [active, setActive] = useState(0);
  const tabs = TAB_KEYS.map((key, i) => ({
    id: `${baseId}-tab-${i}`,
    panelId: `${baseId}-panel-${i}`,
    title: t(`audiences.${key}.title`),
    text: t(`audiences.${key}.text`),
    color:
      key === "sales"
        ? "from-[var(--flux-primary)]/15"
        : key === "operations"
          ? "from-[var(--flux-secondary)]/15"
          : "from-[var(--flux-accent)]/12",
  }));

  return (
    <section id="use-cases" className="home-landing-reveal mt-20 scroll-mt-28 md:mt-24" aria-labelledby="landing-use-cases-heading">
      <h2 id="landing-use-cases-heading" className="font-display text-2xl font-bold md:text-3xl">
        {t("useCases.heading")}
      </h2>
      <p className="mt-2 max-w-2xl text-sm text-[var(--flux-text-muted)] md:text-base">{t("useCases.description")}</p>

      <div className="mt-8">
        <div className="flex flex-wrap gap-2 border-b border-[var(--flux-primary-alpha-15)] pb-3" role="tablist" aria-label={t("useCases.tablistLabel")}>
          {tabs.map((tab, i) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={tab.id}
              aria-selected={active === i}
              aria-controls={tab.panelId}
              tabIndex={active === i ? 0 : -1}
              className={`rounded-[var(--flux-rad)] px-4 py-2 text-sm font-semibold transition-colors ${
                active === i
                  ? "bg-[var(--flux-primary-alpha-20)] text-[var(--flux-text)]"
                  : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
              }`}
              onClick={() => setActive(i)}
            >
              {tab.title}
            </button>
          ))}
        </div>
        <div
          id={tabs[active].panelId}
          role="tabpanel"
          aria-labelledby={tabs[active].id}
          className="mt-6"
        >
          <article className="relative overflow-hidden rounded-[var(--flux-rad-lg)] border border-[var(--flux-primary-alpha-18)] bg-[var(--flux-surface-card)] p-6">
            <div
              className={`pointer-events-none absolute -right-4 -top-4 h-24 w-24 rounded-full bg-gradient-to-br ${tabs[active].color} to-transparent blur-2xl`}
              aria-hidden
            />
            <h3 className="relative font-display text-lg font-semibold">{tabs[active].title}</h3>
            <p className="relative mt-3 text-sm leading-relaxed text-[var(--flux-text-muted)]">{tabs[active].text}</p>
          </article>
        </div>
      </div>
    </section>
  );
}
