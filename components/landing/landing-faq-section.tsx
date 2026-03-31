"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { FaqItem } from "./landing-primitives";

export function LandingFaqSection() {
  const t = useTranslations("landing");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const faqItems = [1, 2, 3, 4, 5, 6, 7].map((n) => ({
    q: t(`faq.q${n}`),
    a: t(`faq.a${n}`),
  }));

  return (
    <section id="faq" className="home-landing-reveal scroll-mt-24 py-12 md:scroll-mt-28 md:py-14" aria-labelledby="landing-faq-heading">
      <p className="landing-section-badge mb-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--flux-secondary)]">
        <span className="h-px w-5 bg-[var(--flux-secondary)]" aria-hidden />
        {t("faq.sectionBadge")}
      </p>
      <h2 id="landing-faq-heading" className="font-display text-[clamp(1.5rem,3vw,2.2rem)] font-bold leading-[1.15] tracking-[-0.02em]">
        {t("faq.heading")}
      </h2>
      <div className="mt-8 grid gap-3 md:grid-cols-2">
        {faqItems.map((item, i) => (
          <FaqItem
            key={i}
            faqId={i}
            question={item.q}
            answer={item.a}
            open={openFaq === i}
            onToggle={() => setOpenFaq(openFaq === i ? null : i)}
          />
        ))}
      </div>
    </section>
  );
}
