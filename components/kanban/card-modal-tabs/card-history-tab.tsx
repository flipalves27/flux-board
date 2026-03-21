"use client";

import { useMemo } from "react";
import { useCardModal } from "@/components/kanban/card-modal-context";
import { CardModalSection } from "@/components/kanban/card-modal-section";
import type { CardModalTabBaseProps } from "@/components/kanban/card-modal-tabs/types";

export default function CardHistoryTab({ cardId: _cardId }: CardModalTabBaseProps) {
  const { card, buckets, t } = useCardModal();

  const bucketLabel = useMemo(() => buckets.find((b) => b.key === card.bucket)?.label ?? card.bucket, [buckets, card.bucket]);

  const automationEntries = useMemo(() => {
    const fired = card.automationState?.lastFired;
    if (!fired || typeof fired !== "object") return [];
    return Object.entries(fired).map(([automationId, at]) => ({ automationId, at: String(at) }));
  }, [card.automationState?.lastFired]);

  const enteredAt = card.columnEnteredAt?.trim();

  return (
    <CardModalSection title={t("cardModal.history.title")} description={t("cardModal.history.description")}>
      <ul className="space-y-3 border-l-2 border-[var(--flux-primary-alpha-35)] pl-4">
        <li className="relative">
          <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-[var(--flux-primary)] ring-4 ring-[var(--flux-primary-alpha-15)]" />
          <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--flux-text-muted)]">
            {t("cardModal.history.currentColumn")}
          </div>
          <div className="text-sm font-semibold text-[var(--flux-text)]">{bucketLabel}</div>
        </li>
        {enteredAt ? (
          <li className="relative">
            <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-[var(--flux-secondary)] ring-4 ring-[var(--flux-secondary-alpha-12)]" />
            <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--flux-text-muted)]">
              {t("cardModal.history.columnEntered")}
            </div>
            <div className="text-sm text-[var(--flux-text)]">
              {(() => {
                try {
                  return new Date(enteredAt).toLocaleString();
                } catch {
                  return enteredAt;
                }
              })()}
            </div>
          </li>
        ) : (
          <li className="text-xs text-[var(--flux-text-muted)]">{t("cardModal.history.noEnteredAt")}</li>
        )}
        {automationEntries.length > 0 ? (
          <li className="relative pt-1">
            <span className="absolute -left-[21px] top-2 h-2.5 w-2.5 rounded-full bg-[var(--flux-warning-alpha-90)] ring-4 ring-[var(--flux-warning-alpha-12)]" />
            <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--flux-text-muted)] mb-2">
              {t("cardModal.history.automations")}
            </div>
            <ul className="space-y-2">
              {automationEntries.map(({ automationId, at }) => (
                <li key={automationId} className="rounded-lg border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-black-alpha-12)] px-3 py-2">
                  <div className="font-mono text-[11px] text-[var(--flux-primary-light)]">{automationId}</div>
                  <div className="text-[11px] text-[var(--flux-text-muted)]">
                    {(() => {
                      try {
                        return new Date(at).toLocaleString();
                      } catch {
                        return at;
                      }
                    })()}
                  </div>
                </li>
              ))}
            </ul>
          </li>
        ) : null}
      </ul>
    </CardModalSection>
  );
}
