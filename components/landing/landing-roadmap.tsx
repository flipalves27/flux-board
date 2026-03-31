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
    <section className="home-landing-reveal py-12 md:py-14" aria-labelledby="landing-roadmap-heading">
      <div className="mb-8 max-w-3xl md:mb-9">
        <h2 id="landing-roadmap-heading" className="font-display text-[clamp(1.5rem,3vw,2.2rem)] font-bold leading-[1.15] tracking-[-0.02em]">
          {t("roadmap.heading")}
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-[var(--flux-text-muted)]">{t("roadmap.description")}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {ROADMAP_ITEMS.map((item) => (
          <article
            key={item.id}
            className="rounded-[var(--flux-rad-xl)] border border-[var(--flux-primary-alpha-15)] bg-[rgba(34,31,58,0.5)] p-6 backdrop-blur-sm transition-all duration-300 hover:border-[var(--flux-primary-alpha-25)]"
          >
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
