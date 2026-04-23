"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { BucketConfig, CardData } from "@/app/board/[id]/page";

const SAFE_FLOW_KEYS = [
  "program-backlog",
  "preparacao-wsjf",
  "pi-planning",
  "em-iteracao",
  "integracao-demo",
  "concluido",
] as const;

function normalizeKey(k: string): string {
  return k.trim().toLowerCase();
}

function inferActiveSafePhase(
  buckets: BucketConfig[],
  cards: CardData[]
): (typeof SAFE_FLOW_KEYS)[number] | null {
  const keyToLabel = new Map<string, string>();
  for (const b of buckets) {
    const nk = normalizeKey(b.key);
    if (nk) keyToLabel.set(nk, b.label);
  }
  const set = new Set(SAFE_FLOW_KEYS);
  const counts = new Map<string, number>();
  for (const k of SAFE_FLOW_KEYS) counts.set(k, 0);
  for (const c of cards) {
    const bk = normalizeKey(c.bucket);
    if (!set.has(bk as (typeof SAFE_FLOW_KEYS)[number])) continue;
    if (c.progress === "Concluída") continue;
    counts.set(bk, (counts.get(bk) ?? 0) + 1);
  }
  let best: (typeof SAFE_FLOW_KEYS)[number] | null = null;
  let bestN = -1;
  for (const k of SAFE_FLOW_KEYS) {
    const n = counts.get(k) ?? 0;
    if (n > bestN) {
      bestN = n;
      best = k;
    }
  }
  if (bestN <= 0) {
    for (const k of SAFE_FLOW_KEYS) {
      if (keyToLabel.has(k)) return k;
    }
    return null;
  }
  return best;
}

export type BoardSafeContextStripProps = {
  buckets: BucketConfig[];
  cards: CardData[];
  onOpenAssist: () => void;
  className?: string;
};

export function BoardSafeContextStrip({ buckets, cards, onOpenAssist, className = "" }: BoardSafeContextStripProps) {
  const t = useTranslations("kanban.board.safe");
  const phase = useMemo(() => inferActiveSafePhase(buckets, cards), [buckets, cards]);
  const checklistKey = phase ?? "program-backlog";

  return (
    <div
      className={`flex flex-wrap items-center gap-2 border-b border-[var(--flux-border-muted)] bg-[var(--flux-black-alpha-04)] px-4 py-2 sm:px-5 lg:px-6 ${className}`.trim()}
    >
      <span className="text-[11px] font-semibold text-[var(--flux-text-muted)]">{t("flowFocus")}</span>
      <span className="rounded-lg border border-[var(--flux-primary-alpha-35)] bg-[var(--flux-primary-alpha-10)] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[var(--flux-primary-light)]">
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
