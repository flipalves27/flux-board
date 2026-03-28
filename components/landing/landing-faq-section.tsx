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
    <section id="faq" className="home-landing-reveal mt-20 scroll-mt-28 md:mt-24" aria-labelledby="landing-faq-heading">
      <h2 id="landing-faq-heading" className="mb-6 font-display text-2xl font-bold md:text-3xl">
        {t("faq.heading")}
      </h2>
      <div className="grid gap-3 md:grid-cols-2">
        {faqItems.map((item, i) => (
          <FaqItem
            key={i}
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
