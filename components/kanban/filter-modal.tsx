"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useModalA11y } from "@/components/ui/use-modal-a11y";
import { useTranslations } from "next-intl";

type MatrixWeightFilterKey = "all" | "critical_high" | "high_plus" | "medium_plus" | "critical";

type FilterModalState = {
  activePrio: string;
  activeLabels: string[];
  searchQuery: string;
  matrixWeightFilter: MatrixWeightFilterKey;
  sprintScopeOnly: boolean;
};

type FilterModalProps = {
  open: boolean;
  onClose: () => void;
  priorities: string[];
  labels: string[];
  matrixWeightOptions: { key: MatrixWeightFilterKey; label: string }[];
  sprintEnabled: boolean;
  t: (key: string, values?: Record<string, string | number>) => string;
  initialState: FilterModalState;
  onApply: (next: FilterModalState) => void;
  onClear: () => void;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
  /** Abre a ferramenta de priorização de backlog (IA) — o pai renderiza o drawer. */
  onOpenBacklogPrioritize?: () => void;
};

export function FilterModal({
  open,
  onClose,
  priorities,
  labels,
  matrixWeightOptions,
  sprintEnabled,
  t,
  initialState,
  onApply,
  onClear,
  searchInputRef,
  onOpenBacklogPrioritize,
}: FilterModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const localSearchRef = useRef<HTMLInputElement | null>(null);
  const tPrioritize = useTranslations("kanban.backlogPrioritize");

  const [draft, setDraft] = useState<FilterModalState>(initialState);
  const mergedSearchRef = searchInputRef ?? localSearchRef;
  const hasActiveFilters = useMemo(
    () =>
      draft.activePrio !== "all" ||
      draft.activeLabels.length > 0 ||
      draft.searchQuery.trim().length > 0 ||
      draft.matrixWeightFilter !== "all" ||
      draft.sprintScopeOnly,
    [draft]
  );

  useEffect(() => {
    if (!open) return;
    setDraft(initialState);
  }, [open, initialState]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => mergedSearchRef.current?.focus(), 40);
    return () => window.clearTimeout(id);
  }, [open, mergedSearchRef]);

  useModalA11y({
    open,
    onClose,
    containerRef: dialogRef,
    initialFocusRef: closeRef,
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[var(--flux-z-kanban-modal-stack)] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-[var(--flux-backdrop-scrim)] backdrop-blur-sm"
        aria-label={t("board.filterModal.close")}
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="board-filter-modal-title"
        className="relative z-[1] w-full max-w-2xl max-h-[90dvh] overflow-hidden rounded-2xl border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--flux-chrome-alpha-08)] px-5 py-4">
          <h2 id="board-filter-modal-title" className="text-base font-semibold text-[var(--flux-text)]">
            {t("board.filterModal.title")}
          </h2>
          <button ref={closeRef} type="button" onClick={onClose} className="btn-ghost px-2 py-1">
            {t("board.filterModal.close")}
          </button>
        </div>

        <div className="grid gap-4 overflow-y-auto px-5 py-4">
          <section className="space-y-2">
            <label className="text-flux-xs font-semibold text-[var(--flux-text-muted)]">
              {t("board.filterModal.search")}
            </label>
            <input
              ref={mergedSearchRef}
              type="text"
              value={draft.searchQuery}
              onChange={(e) => setDraft((p) => ({ ...p, searchQuery: e.target.value }))}
              placeholder={t("board.searchPlaceholder")}
              className="w-full rounded-lg border border-[var(--flux-control-border)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-sm outline-none focus:border-[var(--flux-primary)]"
            />
          </section>

          <section className="space-y-2">
            <p className="text-flux-xs font-semibold text-[var(--flux-text-muted)]">{t("board.filterModal.priority")}</p>
            <div className="flex flex-wrap gap-2">
              {["all", ...priorities].map((prio) => (
                <button
                  key={prio}
                  type="button"
                  onClick={() => setDraft((p) => ({ ...p, activePrio: prio }))}
                  className={`rounded-lg border px-2.5 py-1 text-flux-xs font-semibold transition-colors ${
                    draft.activePrio === prio
                      ? "border-[var(--flux-primary-alpha-45)] bg-[var(--flux-primary-alpha-12)] text-[var(--flux-primary-light)]"
                      : "border-[var(--flux-chrome-alpha-12)] text-[var(--flux-text-muted)] hover:border-[var(--flux-primary-alpha-35)]"
                  }`}
                >
                  {prio === "all" ? t("board.filterModal.all") : prio}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <p className="text-flux-xs font-semibold text-[var(--flux-text-muted)]">{t("board.filterModal.labels")}</p>
            <div className="flex flex-wrap gap-2">
              {labels.length === 0 ? (
                <span className="text-flux-xs text-[var(--flux-text-muted)]">{t("board.filterModal.noLabels")}</span>
              ) : (
                labels.map((label) => {
                  const selected = draft.activeLabels.includes(label);
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() =>
                        setDraft((p) => ({
                          ...p,
                          activeLabels: selected ? p.activeLabels.filter((x) => x !== label) : [...p.activeLabels, label],
                        }))
                      }
                      className={`rounded-lg border px-2.5 py-1 text-flux-xs font-semibold transition-colors ${
                        selected
                          ? "border-[var(--flux-primary-alpha-45)] bg-[var(--flux-primary-alpha-12)] text-[var(--flux-primary-light)]"
                          : "border-[var(--flux-chrome-alpha-12)] text-[var(--flux-text-muted)] hover:border-[var(--flux-primary-alpha-35)]"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })
              )}
            </div>
          </section>

          <section className="space-y-2">
            <p className="text-flux-xs font-semibold text-[var(--flux-text-muted)]">{t("board.filters.matrixWeightLabel")}</p>
            <div className="flex flex-wrap gap-2">
              {matrixWeightOptions.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setDraft((p) => ({ ...p, matrixWeightFilter: opt.key }))}
                  className={`rounded-lg border px-2.5 py-1 text-flux-xs font-semibold transition-colors ${
                    draft.matrixWeightFilter === opt.key
                      ? "border-[var(--flux-primary-alpha-45)] bg-[var(--flux-primary-alpha-12)] text-[var(--flux-primary-light)]"
                      : "border-[var(--flux-chrome-alpha-12)] text-[var(--flux-text-muted)] hover:border-[var(--flux-primary-alpha-35)]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </section>

          {sprintEnabled ? (
            <section className="space-y-2">
              <p className="text-flux-xs font-semibold text-[var(--flux-text-muted)]">{t("board.filterModal.sprint")}</p>
              <button
                type="button"
                onClick={() => setDraft((p) => ({ ...p, sprintScopeOnly: !p.sprintScopeOnly }))}
                className={`rounded-lg border px-2.5 py-1 text-flux-xs font-semibold transition-colors ${
                  draft.sprintScopeOnly
                    ? "border-[var(--flux-primary-alpha-45)] bg-[var(--flux-primary-alpha-12)] text-[var(--flux-primary-light)]"
                    : "border-[var(--flux-chrome-alpha-12)] text-[var(--flux-text-muted)] hover:border-[var(--flux-primary-alpha-35)]"
                }`}
              >
                {draft.sprintScopeOnly ? t("board.filters.sprintOnly") : t("board.filters.sprintAll")}
              </button>
            </section>
          ) : null}

          {onOpenBacklogPrioritize ? (
            <section className="space-y-2 border-t border-[var(--flux-chrome-alpha-08)] pt-4">
              <p className="text-flux-xs font-semibold text-[var(--flux-text-muted)]">{t("board.filterModal.tools")}</p>
              <button type="button" onClick={onOpenBacklogPrioritize} className="btn-secondary text-sm">
                {tPrioritize("open")}
              </button>
            </section>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t border-[var(--flux-chrome-alpha-08)] px-5 py-4">
          <button
            type="button"
            onClick={() => {
              onClear();
              onClose();
            }}
            className="btn-secondary"
            disabled={!hasActiveFilters}
          >
            {t("board.filterModal.clear")}
          </button>
          <button
            type="button"
            onClick={() => {
              onApply(draft);
              onClose();
            }}
            className="btn-primary"
          >
            {t("board.filterModal.apply")}
          </button>
        </div>
      </div>
    </div>
  );
}
