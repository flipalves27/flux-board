"use client";

import { useTranslations } from "next-intl";
import { ROADMAP_ITEMS, type RoadmapTier } from "@/lib/landing-models";
import { PlanChip } from "./landing-primitives";

type ChargeMap = Record<Exclude<RoadmapTier, "free">, string>;

type LandingRoadmapProps = {
  chargeLabelByTier: ChargeMap;
};

export function LandingRoadmap({ chargeLabelByTier }: LandingRoadmapProps) {
  const t = useTranslations("landing");

  return (
    <section className="home-landing-reveal mt-12 md:mt-16" aria-labelledby="landing-roadmap-heading">
      <div className="mb-5 max-w-3xl md:mb-6">
        <h2 id="landing-roadmap-heading" className="font-display text-2xl font-bold md:text-3xl">
          {t("roadmap.heading")}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-[var(--flux-text-muted)] md:text-base">{t("roadmap.description")}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {ROADMAP_ITEMS.map((item) => (
          <article key={item.id} className="rounded-[var(--flux-rad-lg)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-card)] p-5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="font-display text-base font-semibold">{t(`roadmap.items.${item.id}.title`)}</h3>
              <PlanChip label={t(`pricing.tiers.${item.tier}`)} />
            </div>
            <p className="text-sm leading-relaxed text-[var(--flux-text-muted)]">{t(`roadmap.items.${item.id}.detail`)}</p>
            <p className="mt-3 text-xs font-semibold text-[var(--flux-secondary)]">{chargeLabelByTier[item.tier]}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
