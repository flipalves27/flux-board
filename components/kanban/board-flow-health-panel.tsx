"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { CardData, BucketConfig } from "@/app/board/[id]/page";
import {
  buildPortfolioSnapshot,
  listWipBreaches,
  listStagnantOpenCardIds,
  countOverdueOpenCards,
  listBlockedCardIds,
  boardWipValidationOk,
} from "@/lib/board-flow-insights";
import { apiGet, ApiError } from "@/lib/api-client";
import { useModalA11y } from "@/components/ui/use-modal-a11y";

type CfdResponse = {
  schema?: string;
  note?: string;
  wipRising?: boolean;
  distinctSnapshotDays?: number;
};

export type BoardFlowHealthPanelProps = {
  open: boolean;
  onClose: () => void;
  boardId: string;
  cards: CardData[];
  buckets: BucketConfig[];
  lastUpdated: string;
  getHeaders: () => Record<string, string>;
  onOpenCard: (cardId: string) => void;
};

export function BoardFlowHealthPanel({
  open,
  onClose,
  boardId,
  cards,
  buckets,
  lastUpdated,
  getHeaders,
  onOpenCard,
}: BoardFlowHealthPanelProps) {
  const t = useTranslations("kanban");
  const locale = useLocale();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useModalA11y({ open, onClose, containerRef: panelRef, initialFocusRef: closeRef });

  const [cfdNote, setCfdNote] = useState<string | null>(null);
  const [cfdLoading, setCfdLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setCfdLoading(true);
    void (async () => {
      try {
        const data = await apiGet<CfdResponse>("/api/flux-reports/cfd-daily?period=14", getHeaders());
        if (cancelled) return;
        setCfdNote(typeof data.note === "string" ? data.note : null);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          setCfdNote(t("board.flowHealth.cfdGated"));
        } else {
          setCfdNote(null);
        }
      } finally {
        if (!cancelled) setCfdLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, getHeaders, t]);

  const portfolio = useMemo(
    () => buildPortfolioSnapshot({ cards, config: { bucketOrder: buckets }, lastUpdated }),
    [cards, buckets, lastUpdated]
  );

  const wipOk = useMemo(() => boardWipValidationOk(buckets, cards), [buckets, cards]);
  const breaches = useMemo(() => listWipBreaches(buckets, cards), [buckets, cards]);
  const stagnantIds = useMemo(() => listStagnantOpenCardIds(cards, 5, Date.now()), [cards]);
  const overdue = useMemo(() => countOverdueOpenCards(cards, Date.now()), [cards]);
  const blockedIds = useMemo(() => listBlockedCardIds(cards), [cards]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[var(--flux-z-modal-feature)] flex justify-end bg-black/45 backdrop-blur-[1px]"
      onClick={onClose}
      onKeyDown={onKeyDown}
      role="presentation"
    >
      <aside
        ref={panelRef}
        className="h-full w-[min(420px,100vw)] border-l border-[var(--flux-border-default)] bg-[var(--flux-surface-card)] shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="flow-health-title"
      >
        <div className="flex items-center justify-between gap-2 border-b border-[var(--flux-border-muted)] px-4 py-3">
          <h2 id="flow-health-title" className="text-sm font-display font-bold text-[var(--flux-text)]">
            {t("board.flowHealth.title")}
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="rounded-lg p-2 text-[var(--flux-text-muted)] hover:bg-[var(--flux-surface-hover)]"
            onClick={onClose}
            aria-label={t("board.flowHealth.close")}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 scrollbar-kanban text-sm text-[var(--flux-text)]">
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)] mb-2">
              {t("board.flowHealth.portfolio")}
            </h3>
            <ul className="space-y-1 text-[13px]">
              <li>{t("board.flowHealth.risk", { n: portfolio.risco ?? "—" })}</li>
              <li>{t("board.flowHealth.throughput", { n: portfolio.throughput ?? "—" })}</li>
              <li>{t("board.flowHealth.predictability", { n: portfolio.previsibilidade ?? "—" })}</li>
            </ul>
          </section>

          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)] mb-2">WIP</h3>
            <p className="text-[13px]">{wipOk ? t("board.flowHealth.wipOk") : t("board.flowHealth.wipBreached")}</p>
            {breaches.length > 0 ? (
              <ul className="mt-2 space-y-1 text-[12px] text-[var(--flux-danger)]">
                {breaches.map((b) => (
                  <li key={b.bucketKey}>
                    {b.bucketKey}: {b.count}/{b.limit}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)] mb-2">
              {t("board.flowHealth.stagnantHeading")}
            </h3>
            {stagnantIds.length === 0 ? (
              <p className="text-[13px] text-[var(--flux-text-muted)]">{t("board.flowHealth.none")}</p>
            ) : (
              <ul className="space-y-1">
                {stagnantIds.slice(0, 12).map((id) => {
                  const c = cards.find((x) => x.id === id);
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        className="text-left text-[12px] text-[var(--flux-primary-light)] hover:underline"
                        onClick={() => {
                          onOpenCard(id);
                          onClose();
                        }}
                      >
                        {c?.title ?? id}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)] mb-2">
              {t("board.flowHealth.blockedHeading")}
            </h3>
            {blockedIds.length === 0 ? (
              <p className="text-[13px] text-[var(--flux-text-muted)]">{t("board.flowHealth.none")}</p>
            ) : (
              <ul className="space-y-1">
                {blockedIds.slice(0, 12).map((id) => {
                  const c = cards.find((x) => x.id === id);
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        className="text-left text-[12px] text-[var(--flux-primary-light)] hover:underline"
                        onClick={() => {
                          onOpenCard(id);
                          onClose();
                        }}
                      >
                        {c?.title ?? id}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)] mb-2">
              {t("board.flowHealth.overdueHeading")}
            </h3>
            {overdue.count === 0 ? (
              <p className="text-[13px] text-[var(--flux-text-muted)]">{t("board.flowHealth.none")}</p>
            ) : (
              <p className="text-[13px]">{t("board.flowHealth.overdueCount", { count: overdue.count })}</p>
            )}
          </section>

          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)] mb-2">CFD</h3>
            {cfdLoading ? (
              <p className="text-[13px] text-[var(--flux-text-muted)]">{t("board.flowHealth.loading")}</p>
            ) : cfdNote ? (
              <p className="text-[12px] text-[var(--flux-text-muted)] leading-snug">{cfdNote}</p>
            ) : (
              <p className="text-[13px] text-[var(--flux-text-muted)]">{t("board.flowHealth.cfdHint")}</p>
            )}
            <Link
              href={`/${locale}/reports`}
              className="inline-block mt-2 text-[12px] font-semibold text-[var(--flux-primary-light)] hover:underline"
            >
              {t("board.flowHealth.openReports")}
            </Link>
          </section>
        </div>
      </aside>
    </div>
  );
}
