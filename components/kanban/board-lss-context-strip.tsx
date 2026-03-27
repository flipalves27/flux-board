"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { BucketConfig, CardData } from "@/app/board/[id]/page";

const DMAIC_KEYS = ["define", "measure", "analyze", "improve", "control"] as const;

function normalizeKey(k: string): string {
  return k.trim().toLowerCase();
}

/** Fase DMAIC com mais cards não concluídos; empate pela ordem DMAIC. */
export function inferActiveDmaicPhase(
  buckets: BucketConfig[],
  cards: CardData[]
): (typeof DMAIC_KEYS)[number] | null {
  const keyToLabel = new Map<string, string>();
  for (const b of buckets) {
    const nk = normalizeKey(b.key);
    if (nk) keyToLabel.set(nk, b.label);
  }
  const counts = new Map<string, number>();
  for (const k of DMAIC_KEYS) counts.set(k, 0);
  const dmaicSet = new Set<string>(DMAIC_KEYS);
  for (const c of cards) {
    const bk = normalizeKey(c.bucket);
    if (!dmaicSet.has(bk)) continue;
    if (c.progress === "Concluída") continue;
    counts.set(bk, (counts.get(bk) ?? 0) + 1);
  }
  let best: (typeof DMAIC_KEYS)[number] | null = null;
  let bestN = -1;
  for (const k of DMAIC_KEYS) {
    const n = counts.get(k) ?? 0;
    if (n > bestN) {
      bestN = n;
      best = k;
    }
  }
  if (bestN <= 0) {
    for (const k of DMAIC_KEYS) {
      if (keyToLabel.has(k)) return k;
    }
    return null;
  }
  return best;
}

export type BoardLssContextStripProps = {
  buckets: BucketConfig[];
  cards: CardData[];
  onOpenAssist: () => void;
};

export function BoardLssContextStrip({ buckets, cards, onOpenAssist }: BoardLssContextStripProps) {
  const t = useTranslations("kanban.board.lss");
  const phase = useMemo(() => inferActiveDmaicPhase(buckets, cards), [buckets, cards]);
  const checklistKey = phase ?? "define";

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[var(--flux-border-muted)] bg-[var(--flux-black-alpha-04)] px-4 py-2 sm:px-5 lg:px-6">
      <span className="text-[11px] font-semibold text-[var(--flux-text-muted)]">{t("dmaicFocus")}</span>
      <span className="rounded-lg border border-[var(--flux-secondary-alpha-35)] bg-[var(--flux-secondary-alpha-10)] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[var(--flux-secondary)]">
        {phase ? t(`phases.${phase}`) : t("phases.unknown")}
      </span>
      <p className="text-[11px] text-[var(--flux-text-muted)] max-w-[min(100%,420px)] leading-snug">
        {t(`checklist.${checklistKey}`)}
      </p>
      <button
        type="button"
        onClick={onOpenAssist}
        className="ml-auto shrink-0 rounded-lg border border-[var(--flux-primary-alpha-45)] bg-[var(--flux-primary-alpha-12)] px-2.5 py-1 text-[11px] font-semibold text-[var(--flux-primary-light)] transition-colors hover:bg-[var(--flux-primary-alpha-18)]"
      >
        {t("openAssist")}
      </button>
    </div>
  );
}
