"use client";

import { useTranslations } from "next-intl";
import { Info } from "lucide-react";
import { TRIAL_DAYS } from "@/lib/billing-limits";

/**
 * Aviso na landing pública: programa beta e prazo para habilitação de checkout comercial.
 */
export function LandingBetaBanner() {
  const t = useTranslations("landing.betaBanner");

  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-8 flex gap-3 rounded-xl border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-4 py-3.5 shadow-[var(--flux-shadow-sm)] sm:gap-4 sm:px-5 sm:py-4"
    >
      <div className="mt-0.5 shrink-0 text-[var(--flux-secondary)]" aria-hidden>
        <Info className="h-5 w-5" strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-md border border-[var(--flux-secondary-alpha-35)] bg-[var(--flux-secondary-alpha-08)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--flux-secondary)]">
            {t("badge")}
          </span>
        </div>
        <p className="text-sm font-medium leading-snug text-[var(--flux-text)]">{t("title", { days: TRIAL_DAYS })}</p>
        <p className="text-[13px] leading-relaxed text-[var(--flux-text-muted)]">{t("description")}</p>
      </div>
    </div>
  );
}
