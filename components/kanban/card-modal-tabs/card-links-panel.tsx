"use client";

import { CustomTooltip } from "@/components/ui/custom-tooltip";
import { useCardModal } from "@/components/kanban/card-modal-context";
import { CardModalSection } from "@/components/kanban/card-modal-section";
import type { CardModalTabBaseProps } from "@/components/kanban/card-modal-tabs/types";

function isValidOptionalHttpUrl(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  try {
    const u = new URL(t);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export default function CardLinksPanel({ cardId: _cardId }: CardModalTabBaseProps) {
  const { links, setLinks, t } = useCardModal();

  return (
    <CardModalSection title={t("cardModal.sections.links.title")}>
      <div className="rounded-xl border border-[var(--flux-chrome-alpha-06)] bg-[var(--flux-surface-elevated)]/50 overflow-hidden transition-all duration-200">
        <div className="flex items-center justify-end px-4 py-2.5 border-b border-[var(--flux-chrome-alpha-06)]">
          <button
            type="button"
            onClick={() => setLinks((prev) => [...prev, { url: "", label: "" }])}
            className="text-xs font-semibold text-[var(--flux-primary-light)] hover:text-[var(--flux-primary)] px-2 py-1 rounded-lg hover:bg-[var(--flux-primary-alpha-12)] transition-colors"
          >
            {t("cardModal.sections.links.addButton")}
          </button>
        </div>
        <ul className="divide-y divide-[var(--flux-chrome-alpha-06)] max-h-[min(50vh,320px)] overflow-y-auto scrollbar-kanban">
          {links.length === 0 ? (
            <li className="px-4 py-4 text-center text-xs text-[var(--flux-text-muted)]">
              {t("cardModal.sections.links.empty")}
            </li>
          ) : (
            links.map((link, idx) => {
              const urlOk = isValidOptionalHttpUrl(link.url);
              return (
                <li key={idx} className="px-4 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 group">
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <input
                      type="url"
                      value={link.url}
                      onChange={(e) =>
                        setLinks((prev) => {
                          const next = [...prev];
                          next[idx] = { ...next[idx], url: e.target.value };
                          return next;
                        })
                      }
                      placeholder={t("cardModal.sections.links.urlPlaceholder")}
                      aria-invalid={!urlOk}
                      className={`w-full px-3 py-2 text-sm border rounded-lg bg-[var(--flux-surface-card)] text-[var(--flux-text)] placeholder-[var(--flux-text-muted)] focus:border-[var(--flux-primary)] focus:ring-1 focus:ring-[var(--flux-primary)]/20 outline-none transition-all ${
                        !urlOk ? "border-[var(--flux-error-input-ring)]" : "border-[var(--flux-chrome-alpha-12)]"
                      }`}
                    />
                    {!urlOk ? (
                      <span className="text-[11px] text-[var(--flux-danger)]">{t("cardModal.sections.links.invalidUrl")}</span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      type="text"
                      value={link.label ?? ""}
                      onChange={(e) =>
                        setLinks((prev) => {
                          const next = [...prev];
                          next[idx] = { ...next[idx], label: e.target.value };
                          return next;
                        })
                      }
                      placeholder={t("cardModal.sections.links.labelPlaceholder")}
                      className="w-full sm:w-32 px-3 py-2 text-sm border border-[var(--flux-chrome-alpha-12)] rounded-lg bg-[var(--flux-surface-card)] text-[var(--flux-text)] placeholder-[var(--flux-text-muted)] focus:border-[var(--flux-primary)] focus:ring-1 focus:ring-[var(--flux-primary)]/20 outline-none transition-all"
                    />
                    {link.url.trim() && urlOk ? (
                      <CustomTooltip content={t("cardModal.sections.links.tooltips.view")}>
                        <a
                          href={link.url.trim()}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--flux-primary-light)] hover:bg-[var(--flux-primary-alpha-15)] transition-colors shrink-0"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                            />
                          </svg>
                        </a>
                      </CustomTooltip>
                    ) : null}
                    <CustomTooltip content={t("cardModal.sections.links.tooltips.remove")}>
                      <button
                        type="button"
                        onClick={() => setLinks((prev) => prev.filter((_, i) => i !== idx))}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--flux-text-muted)] hover:bg-[var(--flux-danger-alpha-15)] hover:text-[var(--flux-danger)] transition-colors opacity-70 group-hover:opacity-100"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </CustomTooltip>
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </CardModalSection>
  );
}
