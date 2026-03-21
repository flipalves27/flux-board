"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CustomTooltip } from "@/components/ui/custom-tooltip";
import { useCardModal } from "@/components/kanban/card-modal-context";
import { apiPost } from "@/lib/api-client";
import { CardModalSection, inputBase } from "@/components/kanban/card-modal-section";
import { DESCRIPTION_BLOCKS } from "@/components/kanban/description-blocks";
import { SmartEnrichFieldShell } from "@/components/kanban/smart-enrich-field";
import type { CardModalTabBaseProps } from "@/components/kanban/card-modal-tabs/types";

type DupMatch = {
  cardId: string;
  title: string;
  bucketLabel: string;
  score: number;
  levenshteinTitleRatio: number;
  bm25Norm: number;
  embeddingSimilarity?: number;
};

/** Campos principais do card (aba padrão, import síncrono para abertura rápida do modal). */
export function CardEditForm({ cardId: _cardId }: CardModalTabBaseProps) {
  const {
    id,
    setId,
    title,
    setTitle,
    setAiContextApplied,
    descBlocks,
    setDescBlocks,
    bucket,
    setBucket,
    priority,
    setPriority,
    progress,
    setProgress,
    dueDate,
    setDueDate,
    blockedBy,
    setBlockedBy,
    depSearch,
    setDepSearch,
    selectablePeers,
    filteredPeers,
    tags,
    newLabel,
    setNewLabel,
    filterLabels,
    toggleTag,
    handleCreateLabel,
    handleDeleteLabel,
    mode,
    directions,
    direction,
    setDirection,
    smartEnrichBusy,
    smartEnrichPending,
    smartEnrichMeta,
    acceptSmartEnrichField,
    rejectSmartEnrichField,
    dismissSmartEnrichKey,
    requestSmartEnrich,
    buckets,
    priorities,
    progresses,
    aiContextApplied,
    aiContextCanGenerate,
    aiContextBusy,
    generateAiContextForCard,
    descriptionForSave,
    boardId,
    getHeaders,
    openExistingCard,
    mergeDraftIntoExistingCard,
    t,
  } = useCardModal();

  const [dupMatches, setDupMatches] = useState<DupMatch[]>([]);
  const [dupLoading, setDupLoading] = useState(false);
  const [dupIgnoreFingerprint, setDupIgnoreFingerprint] = useState<string | null>(null);
  const dupDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dupSeqRef = useRef(0);

  const contentFingerprint = useMemo(
    () => `${title.trim()}|${descriptionForSave.trim()}`,
    [title, descriptionForSave]
  );

  useEffect(() => {
    if (mode !== "new" || (!openExistingCard && !mergeDraftIntoExistingCard)) {
      setDupMatches([]);
      setDupLoading(false);
      return;
    }
    if (dupIgnoreFingerprint === contentFingerprint) {
      setDupMatches([]);
      setDupLoading(false);
      return;
    }
    const q = title.trim();
    if (q.length < 3) {
      setDupMatches([]);
      setDupLoading(false);
      return;
    }

    if (dupDebounceRef.current != null) clearTimeout(dupDebounceRef.current);
    dupDebounceRef.current = setTimeout(() => {
      const seq = ++dupSeqRef.current;
      setDupLoading(true);
      void (async () => {
        try {
          const data = await apiPost<{ matches: DupMatch[] }>(
            `/api/boards/${encodeURIComponent(boardId)}/card-similarity`,
            { title: q, description: descriptionForSave.trim() },
            getHeaders()
          );
          if (dupSeqRef.current !== seq) return;
          setDupMatches(Array.isArray(data.matches) ? data.matches : []);
        } catch {
          if (dupSeqRef.current !== seq) return;
          setDupMatches([]);
        } finally {
          if (dupSeqRef.current === seq) setDupLoading(false);
        }
      })();
    }, 500);

    return () => {
      if (dupDebounceRef.current != null) clearTimeout(dupDebounceRef.current);
    };
  }, [
    mode,
    openExistingCard,
    mergeDraftIntoExistingCard,
    title,
    descriptionForSave,
    contentFingerprint,
    dupIgnoreFingerprint,
    boardId,
    getHeaders,
  ]);

  const showDuplicatePanel =
    mode === "new" &&
    Boolean(openExistingCard || mergeDraftIntoExistingCard) &&
    dupIgnoreFingerprint !== contentFingerprint &&
    (dupLoading || dupMatches.length > 0);

  return (
    <div className="space-y-5">
      <CardModalSection
        title={t("cardModal.sections.identification.title")}
        description={t("cardModal.sections.identification.description")}
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-2 uppercase tracking-wider font-display">
              {t("cardModal.fields.id.label")}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder={t("cardModal.fields.id.placeholder")}
                className={`${inputBase} flex-1`}
              />
              <CustomTooltip content={t("cardModal.aiContext.tooltips.trigger")}>
                <button
                  type="button"
                  onClick={generateAiContextForCard}
                  disabled={!aiContextCanGenerate || aiContextBusy}
                  aria-label={t("cardModal.aiContext.tooltips.triggerAria")}
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-[var(--flux-primary-light)] transition-all duration-200 motion-safe:active:scale-95 ${
                    !aiContextCanGenerate || aiContextBusy
                      ? "cursor-not-allowed border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-chrome-alpha-03)] opacity-45"
                      : "border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-chrome-alpha-04)] hover:border-[var(--flux-primary-alpha-45)] hover:bg-[var(--flux-primary-alpha-14)] hover:shadow-[0_0_0_3px_var(--flux-primary-alpha-12),0_8px_24px_-8px_var(--flux-primary-alpha-25)]"
                  }`}
                  title={t("cardModal.aiContext.tooltips.triggerTitle")}
                >
                  <span className="text-lg" aria-hidden>
                    🧠
                  </span>
                </button>
              </CustomTooltip>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-2 uppercase tracking-wider font-display">
              {t("cardModal.fields.column.label")}
            </label>
            <SmartEnrichFieldShell
              active={Boolean(smartEnrichPending?.has("column"))}
              onAccept={() => acceptSmartEnrichField("column")}
              onReject={() => rejectSmartEnrichField("column")}
              badge={t("cardModal.smartEnrich.badge")}
              acceptLabel={t("cardModal.smartEnrich.accept")}
              rejectLabel={t("cardModal.smartEnrich.reject")}
            >
              <select
                value={bucket}
                onChange={(e) => {
                  setBucket(e.target.value);
                  dismissSmartEnrichKey("column");
                }}
                className={inputBase}
              >
                {buckets.map((b) => (
                  <option key={b.key} value={b.key}>
                    {b.label}
                  </option>
                ))}
              </select>
            </SmartEnrichFieldShell>
          </div>
        </div>
      </CardModalSection>

      <CardModalSection
        title={t("cardModal.sections.content.title")}
        description={t("cardModal.sections.content.description")}
      >
        <div>
          <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-2 uppercase tracking-wider font-display">
            {t("cardModal.fields.title.label")}
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setAiContextApplied(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Tab") {
                if (mode === "new") requestSmartEnrich({ immediate: true });
              }
            }}
            placeholder={t("cardModal.fields.title.placeholder")}
            className={`${inputBase} text-base font-medium`}
          />
          {showDuplicatePanel ? (
            <div
              className="mt-2 rounded-xl border border-[var(--flux-warning-alpha-35)] bg-[var(--flux-warning-alpha-08)] px-3 py-2.5 text-left shadow-[inset_0_1px_0_0_var(--flux-chrome-alpha-04)]"
              role="status"
              aria-live="polite"
            >
              <p className="font-display text-[11px] font-bold uppercase tracking-wide text-[var(--flux-text-muted)]">
                {t("cardModal.duplicate.hintTitle")}
              </p>
              {dupLoading ? (
                <p className="mt-1.5 text-xs text-[var(--flux-text-muted)]">{t("cardModal.duplicate.loading")}</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {dupMatches.map((m) => (
                    <li
                      key={m.cardId}
                      className="rounded-lg border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-surface-elevated)]/90 px-2.5 py-2"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold leading-snug text-[var(--flux-text)] line-clamp-2">
                            {m.title}
                          </p>
                          <p className="mt-0.5 text-[11px] text-[var(--flux-text-muted)]">
                            {t("cardModal.duplicate.column")}: {m.bucketLabel} · {t("cardModal.duplicate.score")}:{" "}
                            {(m.score * 100).toFixed(0)}%
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-1.5">
                          {openExistingCard ? (
                            <button
                              type="button"
                              className="rounded-lg border border-[var(--flux-primary-alpha-35)] bg-[var(--flux-primary-alpha-10)] px-2 py-1 text-[11px] font-semibold text-[var(--flux-primary-light)] hover:bg-[var(--flux-primary-alpha-18)]"
                              onClick={() => openExistingCard(m.cardId)}
                            >
                              {t("cardModal.duplicate.goToCard")}
                            </button>
                          ) : null}
                          {mergeDraftIntoExistingCard ? (
                            <button
                              type="button"
                              className="rounded-lg border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-chrome-alpha-04)] px-2 py-1 text-[11px] font-semibold text-[var(--flux-text)] hover:border-[var(--flux-primary-alpha-35)]"
                              onClick={() => mergeDraftIntoExistingCard(m.cardId)}
                            >
                              {t("cardModal.duplicate.mergeWith")}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {!dupLoading && dupMatches.length > 0 ? (
                <button
                  type="button"
                  className="mt-2 text-[11px] font-semibold text-[var(--flux-text-muted)] underline underline-offset-2 hover:text-[var(--flux-text)]"
                  onClick={() => setDupIgnoreFingerprint(contentFingerprint)}
                >
                  {t("cardModal.duplicate.createAnyway")}
                </button>
              ) : null}
            </div>
          ) : null}
          {mode === "new" && smartEnrichBusy ? (
            <p className="mt-1.5 text-[11px] text-[var(--flux-text-muted)]">{t("cardModal.smartEnrich.busy")}</p>
          ) : null}
          {aiContextApplied && (
            <div className="mt-2">
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] border font-semibold ${
                  aiContextApplied.usedLlm
                    ? "bg-[var(--flux-primary-alpha-12)] border-[var(--flux-primary-alpha-35)] text-[var(--flux-primary-light)]"
                    : "bg-[var(--flux-chrome-alpha-04)] border-[var(--flux-chrome-alpha-12)] text-[var(--flux-text-muted)]"
                }`}
              >
                {aiContextApplied.usedLlm ? t("cardModal.badges.aiGenerated") : t("cardModal.badges.aiFallbackStructured")}
              </span>
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-2 uppercase tracking-wider font-display">
            {t("cardModal.fields.description.label")}
          </label>
          <div className="rounded-xl border border-[var(--flux-primary-alpha-22)] bg-[var(--flux-surface-mid)]/95 p-4 shadow-[inset_0_1px_0_0_var(--flux-chrome-alpha-04)]">
            <div className="space-y-3">
              {DESCRIPTION_BLOCKS.map((block) => (
                <div key={block.key}>
                  <label className="mb-1.5 block font-display text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">
                    {block.label}
                  </label>
                  {block.key === "businessContext" ? (
                    <SmartEnrichFieldShell
                      active={Boolean(smartEnrichPending?.has("description"))}
                      onAccept={() => acceptSmartEnrichField("description")}
                      onReject={() => rejectSmartEnrichField("description")}
                      badge={t("cardModal.smartEnrich.badge")}
                      acceptLabel={t("cardModal.smartEnrich.accept")}
                      rejectLabel={t("cardModal.smartEnrich.reject")}
                    >
                      <textarea
                        value={descBlocks[block.key] || ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          setDescBlocks((prev) => ({ ...prev, [block.key]: value }));
                          setAiContextApplied(null);
                          dismissSmartEnrichKey("description");
                        }}
                        placeholder={block.placeholder}
                        rows={3}
                        className="min-h-[90px] w-full resize-y rounded-xl border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-chrome-alpha-04)] p-3 text-sm leading-relaxed text-[var(--flux-text)] placeholder-[var(--flux-text-muted)] outline-none transition-all duration-200 focus:border-[var(--flux-primary)] focus:shadow-[0_0_0_3px_var(--flux-primary-alpha-12)] focus:ring-0 whitespace-pre-wrap"
                      />
                    </SmartEnrichFieldShell>
                  ) : (
                    <textarea
                      value={descBlocks[block.key] || ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        setDescBlocks((prev) => ({ ...prev, [block.key]: value }));
                        setAiContextApplied(null);
                      }}
                      placeholder={block.placeholder}
                      rows={3}
                      className="min-h-[90px] w-full resize-y rounded-xl border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-chrome-alpha-04)] p-3 text-sm leading-relaxed text-[var(--flux-text)] placeholder-[var(--flux-text-muted)] outline-none transition-all duration-200 focus:border-[var(--flux-primary)] focus:shadow-[0_0_0_3px_var(--flux-primary-alpha-12)] focus:ring-0 whitespace-pre-wrap"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
          {aiContextApplied && (
            <div className="mt-2">
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] border font-semibold ${
                  aiContextApplied.usedLlm
                    ? "bg-[var(--flux-primary-alpha-12)] border-[var(--flux-primary-alpha-35)] text-[var(--flux-primary-light)]"
                    : "bg-[var(--flux-chrome-alpha-04)] border-[var(--flux-chrome-alpha-12)] text-[var(--flux-text-muted)]"
                }`}
              >
                {aiContextApplied.usedLlm
                  ? t("cardModal.badges.aiGeneratedText")
                  : t("cardModal.badges.aiFallbackStructuredDescription")}
              </span>
            </div>
          )}
        </div>
      </CardModalSection>

      <CardModalSection
        title={t("cardModal.sections.statusDue.title")}
        description={t("cardModal.sections.statusDue.description")}
      >
        <div className={`grid grid-cols-1 gap-5 ${directions.length ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"}`}>
          <div>
            <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-2 uppercase tracking-wider font-display">
              {t("cardModal.fields.priority.label")}
            </label>
            <SmartEnrichFieldShell
              active={Boolean(smartEnrichPending?.has("priority"))}
              onAccept={() => acceptSmartEnrichField("priority")}
              onReject={() => rejectSmartEnrichField("priority")}
              badge={t("cardModal.smartEnrich.badge")}
              acceptLabel={t("cardModal.smartEnrich.accept")}
              rejectLabel={t("cardModal.smartEnrich.reject")}
            >
              {smartEnrichMeta?.priorityRationale && smartEnrichPending?.has("priority") ? (
                <p className="mb-2 text-[11px] leading-snug text-[var(--flux-text-muted)]">
                  {smartEnrichMeta.priorityRationale}
                </p>
              ) : null}
              <select
                value={priority}
                onChange={(e) => {
                  setPriority(e.target.value);
                  dismissSmartEnrichKey("priority");
                }}
                className={inputBase}
              >
                {priorities.map((p) => (
                  <option key={p} value={p}>
                    {t(`cardModal.options.priority.${p}`) ?? p}
                  </option>
                ))}
              </select>
            </SmartEnrichFieldShell>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-2 uppercase tracking-wider font-display">
              {t("cardModal.fields.progress.label")}
            </label>
            <select value={progress} onChange={(e) => setProgress(e.target.value)} className={inputBase}>
              {progresses.map((p) => (
                <option key={p} value={p}>
                  {t(`cardModal.options.progress.${p}`) ?? p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-2 uppercase tracking-wider font-display">
              {t("cardModal.fields.dueDate.label")}
            </label>
            <SmartEnrichFieldShell
              active={Boolean(smartEnrichPending?.has("dueDate"))}
              onAccept={() => acceptSmartEnrichField("dueDate")}
              onReject={() => rejectSmartEnrichField("dueDate")}
              badge={t("cardModal.smartEnrich.badge")}
              acceptLabel={t("cardModal.smartEnrich.accept")}
              rejectLabel={t("cardModal.smartEnrich.reject")}
            >
              <input
                type="date"
                value={dueDate}
                onChange={(e) => {
                  setDueDate(e.target.value);
                  dismissSmartEnrichKey("dueDate");
                }}
                className={inputBase}
              />
              {smartEnrichMeta && smartEnrichPending?.has("dueDate") ? (
                <p className="mt-2 text-[11px] leading-snug text-[var(--flux-text-muted)]">
                  {smartEnrichMeta.dueExplanationKey === "similar"
                    ? t("cardModal.smartEnrich.dueSimilar", { count: smartEnrichMeta.similarSampleCount })
                    : t("cardModal.smartEnrich.dueNone")}
                </p>
              ) : null}
            </SmartEnrichFieldShell>
          </div>
          {directions.length ? (
            <div>
              <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-2 uppercase tracking-wider font-display">
                {t("cardModal.fields.direction.label")}
              </label>
              <SmartEnrichFieldShell
                active={Boolean(smartEnrichPending?.has("direction"))}
                onAccept={() => acceptSmartEnrichField("direction")}
                onReject={() => rejectSmartEnrichField("direction")}
                badge={t("cardModal.smartEnrich.badge")}
                acceptLabel={t("cardModal.smartEnrich.accept")}
                rejectLabel={t("cardModal.smartEnrich.reject")}
              >
                <select
                  value={direction || ""}
                  onChange={(e) => {
                    const v = e.target.value.trim().toLowerCase();
                    setDirection(v || null);
                    dismissSmartEnrichKey("direction");
                  }}
                  className={inputBase}
                >
                  <option value="">{t("cardModal.fields.direction.none")}</option>
                  {directions.map((d) => {
                    const dk = d.toLowerCase();
                    return (
                      <option key={d} value={dk}>
                        {t(`directions.${dk}`) ?? d}
                      </option>
                    );
                  })}
                </select>
              </SmartEnrichFieldShell>
            </div>
          ) : null}
        </div>
      </CardModalSection>

      <CardModalSection
        title={t("cardModal.sections.dependencies.title")}
        description={t("cardModal.sections.dependencies.description")}
      >
        <div className="space-y-3">
          <label className="block text-xs font-semibold text-[var(--flux-text-muted)] uppercase tracking-wider font-display">
            {t("cardModal.fields.blockedBy.label")}
          </label>
          <input
            type="search"
            value={depSearch}
            onChange={(e) => setDepSearch(e.target.value)}
            placeholder={t("cardModal.fields.blockedBy.placeholder")}
            className={inputBase}
            autoComplete="off"
          />
          <p className="text-[11px] text-[var(--flux-text-muted)]">{t("cardModal.fields.blockedBy.hint")}</p>
          {selectablePeers.length === 0 ? (
            <p className="text-sm text-[var(--flux-text-muted)]">{t("cardModal.fields.blockedBy.empty")}</p>
          ) : (
            <ul
              className="max-h-48 overflow-y-auto rounded-xl border border-[var(--flux-chrome-alpha-10)] divide-y divide-[var(--flux-chrome-alpha-06)] bg-[var(--flux-black-alpha-12)]"
              role="listbox"
              aria-multiselectable
            >
              {filteredPeers.map((c) => {
                const checked = blockedBy.includes(c.id);
                return (
                  <li key={c.id} role="option" aria-selected={checked}>
                    <label className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-[var(--flux-primary-alpha-08)]">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setBlockedBy((prev) =>
                            prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id]
                          )
                        }
                        className="mt-1 rounded border-[var(--flux-chrome-alpha-20)]"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-[var(--flux-text)] truncate">{c.title}</span>
                        <span className="block text-[11px] font-mono text-[var(--flux-text-muted)]">{c.id}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {selectablePeers.length > 0 && filteredPeers.length === 0 && depSearch.trim() ? (
            <p className="text-sm text-[var(--flux-text-muted)]">{t("cardModal.fields.blockedBy.noMatch")}</p>
          ) : null}
        </div>
      </CardModalSection>

      <CardModalSection
        title={t("cardModal.sections.labels.title")}
        description={t("cardModal.sections.labels.description")}
      >
        <SmartEnrichFieldShell
          active={Boolean(smartEnrichPending?.has("tags"))}
          onAccept={() => acceptSmartEnrichField("tags")}
          onReject={() => rejectSmartEnrichField("tags")}
          badge={t("cardModal.smartEnrich.badge")}
          acceptLabel={t("cardModal.smartEnrich.accept")}
          rejectLabel={t("cardModal.smartEnrich.reject")}
        >
          <div>
            <label className="sr-only">{t("cardModal.fields.newLabel.srLabel")}</label>
            <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCreateLabel();
                }
              }}
              placeholder={t("cardModal.fields.newLabel.placeholder")}
              className={`${inputBase} py-2.5`}
            />
            <button
              type="button"
              onClick={handleCreateLabel}
              className="px-4 rounded-xl text-sm font-semibold border border-[var(--flux-primary)] bg-[var(--flux-primary-alpha-15)] text-[var(--flux-primary-light)] hover:bg-[var(--flux-primary-alpha-25)] hover:shadow-[0_0_0_3px_var(--flux-primary-alpha-15)] transition-all duration-200 font-display whitespace-nowrap"
            >
              {t("cardModal.buttons.createLabel")}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {filterLabels.map((label) => (
              <div key={label} className="group relative">
                <button
                  type="button"
                  onClick={() => {
                    toggleTag(label);
                    dismissSmartEnrichKey("tags");
                  }}
                  className={`pl-4 pr-8 py-2 rounded-xl text-sm font-semibold border transition-all duration-200 font-display ${
                    tags.has(label)
                      ? "bg-[var(--flux-primary)] text-white border-[var(--flux-primary)] shadow-sm"
                      : "bg-[var(--flux-surface-elevated)] text-[var(--flux-text-muted)] border-[var(--flux-chrome-alpha-12)] hover:border-[var(--flux-primary)] hover:text-[var(--flux-primary-light)] hover:bg-[var(--flux-primary-alpha-10)]"
                  }`}
                >
                  {label}
                </button>
                <CustomTooltip content={t("cardModal.tooltips.deleteLabel", { label })}>
                  <button
                    type="button"
                    onClick={() => handleDeleteLabel(label)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-md flex items-center justify-center text-[var(--flux-text-muted)] hover:text-[var(--flux-danger)] hover:bg-[var(--flux-danger-alpha-15)] transition-all duration-200 opacity-60 group-hover:opacity-100"
                    aria-label={t("cardModal.tooltips.deleteLabelAria", { label })}
                  >
                    ×
                  </button>
                </CustomTooltip>
              </div>
            ))}
          </div>
          </div>
        </SmartEnrichFieldShell>
      </CardModalSection>
    </div>
  );
}
