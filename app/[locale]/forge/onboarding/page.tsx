"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ForgeOnboardingPage() {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations("forgePage");
  const [step, setStep] = useState(0);

  const steps = [
    { title: "Welcome", body: t("homeSubtitle") },
    { title: "Connect GitHub", body: "Install the Flux GitHub App for your organization." },
    { title: "Index a repo", body: "Pick a repository and run re-index from Repos." },
    { title: "Demo run", body: "Create a run from a card or Spec-Plan review." },
  ];

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="h-1 overflow-hidden rounded-full bg-[var(--flux-chrome-alpha-10)]">
        <div
          className="h-full bg-[var(--flux-primary)] transition-all"
          style={{ width: `${((step + 1) / steps.length) * 100}%` }}
        />
      </div>
      <h1 className="font-display text-xl font-bold text-[var(--flux-text)]">Onboarding</h1>
      <div className="rounded-2xl border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-surface-mid)]/80 p-6">
        <h2 className="text-lg font-semibold text-[var(--flux-text)]">{steps[step]?.title}</h2>
        <p className="mt-2 text-sm text-[var(--flux-text-muted)]">{steps[step]?.body}</p>
        {step === 1 ? (
          <Link
            href="/api/integrations/github/install/start"
            className="mt-4 inline-block rounded-lg bg-[var(--flux-primary)] px-4 py-2 text-sm font-semibold text-white"
          >
            Install GitHub App
          </Link>
        ) : null}
      </div>
      <div className="flex justify-between">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          className="text-sm font-semibold text-[var(--flux-text-muted)] disabled:opacity-40"
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => {
            if (step === steps.length - 1) router.push(`/${locale}/forge`);
            else setStep((s) => Math.min(steps.length - 1, s + 1));
          }}
          className="text-sm font-semibold text-[var(--flux-primary-light)]"
        >
          {step === steps.length - 1 ? t("homeTitle") : "Next"}
        </button>
      </div>
    </div>
  );
}
