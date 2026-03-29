"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { FluxyAvatar } from "@/components/fluxy/fluxy-avatar";
import type { FluxyAvatarState } from "@/components/fluxy/fluxy-types";

function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function getReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, getReducedMotion, () => false);
}

export type OnboardingFluxyHeroProps = {
  open: boolean;
  onDismiss: () => void;
  storageKey: string;
};

export function OnboardingFluxyHero({ open, onDismiss, storageKey }: OnboardingFluxyHeroProps) {
  const t = useTranslations("onboarding.fluxyHero");
  const titleId = useId();
  const ctaRef = useRef<HTMLButtonElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const [fluxyVisual, setFluxyVisual] = useState<Extract<FluxyAvatarState, "celebrating" | "talking">>("celebrating");

  const persistAndDismiss = useCallback(() => {
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      /* ignore quota / private mode */
    }
    onDismiss();
  }, [onDismiss, storageKey]);

  useEffect(() => {
    if (!open) return;
    setFluxyVisual("celebrating");
    const delay = reducedMotion ? 500 : 2600;
    const timer = window.setTimeout(() => setFluxyVisual("talking"), delay);
    return () => window.clearTimeout(timer);
  }, [open, reducedMotion]);

  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => ctaRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") persistAndDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, persistAndDismiss]);

  if (!open) return null;

  const isCelebrating = fluxyVisual === "celebrating";

  return (
    <div
      className="fixed inset-0 z-[var(--flux-z-board-tour-fluxy-welcome)] flex flex-col items-center justify-center gap-8 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300 bg-[radial-gradient(ellipse_75%_55%_at_50%_30%,rgba(0,210,211,0.18)_0%,transparent_52%),rgba(0,0,0,0.78)] backdrop-blur-[2px]"
      role="presentation"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex w-full max-w-lg flex-col items-center text-center"
      >
        <div className="flex min-h-[11rem] items-center justify-center sm:min-h-[13rem]">
          <FluxyAvatar
            state={fluxyVisual}
            size="header"
            showConfetti={isCelebrating}
            className="scale-[2.1] motion-safe:transition-transform motion-safe:duration-500 sm:scale-[2.55]"
            title={t("title")}
          />
        </div>

        <div className="mt-2 max-w-md space-y-3 sm:max-w-lg">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--flux-secondary)]">{t("kicker")}</p>
          <h2 id={titleId} className="font-display text-2xl font-bold tracking-tight text-[var(--flux-text)] sm:text-3xl">
            {t("title")}
          </h2>
          <p className="text-sm leading-relaxed text-[var(--flux-text-muted)] sm:text-[15px]">{t("body")}</p>
          <p className="text-sm leading-relaxed text-[var(--flux-text-muted)] sm:text-[15px]">{t("intro")}</p>
        </div>

        <button
          ref={ctaRef}
          type="button"
          className="btn-primary mt-4 min-h-[44px] px-8 py-2.5 text-sm font-semibold sm:min-w-[12rem]"
          onClick={persistAndDismiss}
        >
          {t("cta")}
        </button>
      </div>
    </div>
  );
}
