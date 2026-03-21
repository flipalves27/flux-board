"use client";

import { useCardModal } from "@/components/kanban/card-modal-context";
import { CardModalSection, inputBase } from "@/components/kanban/card-modal-section";
import type { CardModalTabBaseProps } from "@/components/kanban/card-modal-tabs/types";

export default function CardDocRefsPanel({ cardId: _cardId }: CardModalTabBaseProps) {
  const { docQuery, setDocQuery, docResults, docRefs, setDocRefs, t } = useCardModal();

  return (
    <CardModalSection
      title={t("cardModal.docRefs.title")}
      description={t("cardModal.docRefs.description")}
    >
      <div className="space-y-2">
        <input
          type="text"
          value={docQuery}
          onChange={(e) => setDocQuery(e.target.value)}
          placeholder={t("cardModal.docRefs.searchPlaceholder")}
          className={inputBase}
        />
        {docQuery.trim() && (
          <div className="max-h-[160px] overflow-auto rounded-xl border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-mid)]">
            {docResults.length === 0 ? (
              <div className="px-3 py-2 text-xs text-[var(--flux-text-muted)]">{t("cardModal.docRefs.empty")}</div>
            ) : (
              docResults.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className="block w-full border-b border-[var(--flux-chrome-alpha-06)] px-3 py-2 text-left hover:bg-[var(--flux-chrome-alpha-04)]"
                  onClick={() =>
                    setDocRefs((prev) => {
                      if (prev.some((r) => r.docId === d.id)) return prev;
                      return [...prev, { docId: d.id, title: d.title, excerpt: d.excerpt }];
                    })
                  }
                >
                  <div className="text-xs font-semibold text-[var(--flux-text)]">{d.title}</div>
                  <div className="text-[11px] text-[var(--flux-text-muted)]">{d.excerpt || ""}</div>
                </button>
              ))
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {docRefs.map((r) => (
            <span
              key={r.docId}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--flux-primary-alpha-28)] bg-[var(--flux-primary-alpha-12)] px-2 py-1 text-xs text-[var(--flux-primary-light)]"
            >
              {r.title || r.docId}
              <button
                type="button"
                className="text-[var(--flux-text-muted)] hover:text-[var(--flux-danger)]"
                onClick={() => setDocRefs((prev) => prev.filter((x) => x.docId !== r.docId))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </div>
    </CardModalSection>
  );
}
