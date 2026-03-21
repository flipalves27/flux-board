"use client";

import { CustomTooltip } from "@/components/ui/custom-tooltip";
import { useCardModal } from "@/components/kanban/card-modal-context";
import { CardModalSection, inputBase } from "@/components/kanban/card-modal-section";
import { DESCRIPTION_BLOCKS } from "@/components/kanban/description-blocks";
import type { CardModalTabBaseProps } from "@/components/kanban/card-modal-tabs/types";

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
    buckets,
    priorities,
    progresses,
    aiContextApplied,
    aiContextCanGenerate,
    aiContextBusy,
    generateAiContextForCard,
    t,
  } = useCardModal();

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
                      ? "cursor-not-allowed border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.03)] opacity-45"
                      : "border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.04)] hover:border-[rgba(108,92,231,0.45)] hover:bg-[rgba(108,92,231,0.14)] hover:shadow-[0_0_0_3px_rgba(108,92,231,0.12),0_8px_24px_-8px_rgba(108,92,231,0.25)]"
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
            <select value={bucket} onChange={(e) => setBucket(e.target.value)} className={inputBase}>
              {buckets.map((b) => (
                <option key={b.key} value={b.key}>
                  {b.label}
                </option>
              ))}
            </select>
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
            placeholder={t("cardModal.fields.title.placeholder")}
            className={`${inputBase} text-base font-medium`}
          />
          {aiContextApplied && (
            <div className="mt-2">
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] border font-semibold ${
                  aiContextApplied.usedLlm
                    ? "bg-[rgba(108,92,231,0.12)] border-[rgba(108,92,231,0.35)] text-[var(--flux-primary-light)]"
                    : "bg-[rgba(255,255,255,0.04)] border-[rgba(255,255,255,0.12)] text-[var(--flux-text-muted)]"
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
          <div className="rounded-xl border border-[rgba(108,92,231,0.22)] bg-[var(--flux-surface-mid)]/95 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
            <div className="space-y-3">
              {DESCRIPTION_BLOCKS.map((block) => (
                <div key={block.key}>
                  <label className="mb-1.5 block font-display text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">
                    {block.label}
                  </label>
                  <textarea
                    value={descBlocks[block.key] || ""}
                    onChange={(e) => {
                      const value = e.target.value;
                      setDescBlocks((prev) => ({ ...prev, [block.key]: value }));
                      setAiContextApplied(null);
                    }}
                    placeholder={block.placeholder}
                    rows={3}
                    className="min-h-[90px] w-full resize-y rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.04)] p-3 text-sm leading-relaxed text-[var(--flux-text)] placeholder-[var(--flux-text-muted)] outline-none transition-all duration-200 focus:border-[var(--flux-primary)] focus:shadow-[0_0_0_3px_rgba(108,92,231,0.12)] focus:ring-0 whitespace-pre-wrap"
                  />
                </div>
              ))}
            </div>
          </div>
          {aiContextApplied && (
            <div className="mt-2">
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] border font-semibold ${
                  aiContextApplied.usedLlm
                    ? "bg-[rgba(108,92,231,0.12)] border-[rgba(108,92,231,0.35)] text-[var(--flux-primary-light)]"
                    : "bg-[rgba(255,255,255,0.04)] border-[rgba(255,255,255,0.12)] text-[var(--flux-text-muted)]"
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
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-2 uppercase tracking-wider font-display">
              {t("cardModal.fields.priority.label")}
            </label>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className={inputBase}>
              {priorities.map((p) => (
                <option key={p} value={p}>
                  {t(`cardModal.options.priority.${p}`) ?? p}
                </option>
              ))}
            </select>
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
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputBase} />
          </div>
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
              className="max-h-48 overflow-y-auto rounded-xl border border-[rgba(255,255,255,0.1)] divide-y divide-[rgba(255,255,255,0.06)] bg-[rgba(0,0,0,0.12)]"
              role="listbox"
              aria-multiselectable
            >
              {filteredPeers.map((c) => {
                const checked = blockedBy.includes(c.id);
                return (
                  <li key={c.id} role="option" aria-selected={checked}>
                    <label className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-[rgba(108,92,231,0.08)]">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setBlockedBy((prev) =>
                            prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id]
                          )
                        }
                        className="mt-1 rounded border-[rgba(255,255,255,0.2)]"
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
              className="px-4 rounded-xl text-sm font-semibold border border-[var(--flux-primary)] bg-[rgba(108,92,231,0.15)] text-[var(--flux-primary-light)] hover:bg-[rgba(108,92,231,0.25)] hover:shadow-[0_0_0_3px_rgba(108,92,231,0.15)] transition-all duration-200 font-display whitespace-nowrap"
            >
              {t("cardModal.buttons.createLabel")}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {filterLabels.map((label) => (
              <div key={label} className="group relative">
                <button
                  type="button"
                  onClick={() => toggleTag(label)}
                  className={`pl-4 pr-8 py-2 rounded-xl text-sm font-semibold border transition-all duration-200 font-display ${
                    tags.has(label)
                      ? "bg-[var(--flux-primary)] text-white border-[var(--flux-primary)] shadow-sm"
                      : "bg-[var(--flux-surface-elevated)] text-[var(--flux-text-muted)] border-[rgba(255,255,255,0.12)] hover:border-[var(--flux-primary)] hover:text-[var(--flux-primary-light)] hover:bg-[rgba(108,92,231,0.1)]"
                  }`}
                >
                  {label}
                </button>
                <CustomTooltip content={t("cardModal.tooltips.deleteLabel", { label })}>
                  <button
                    type="button"
                    onClick={() => handleDeleteLabel(label)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-md flex items-center justify-center text-[var(--flux-text-muted)] hover:text-[var(--flux-danger)] hover:bg-[rgba(255,107,107,0.15)] transition-all duration-200 opacity-60 group-hover:opacity-100"
                    aria-label={t("cardModal.tooltips.deleteLabelAria", { label })}
                  >
                    ×
                  </button>
                </CustomTooltip>
              </div>
            ))}
          </div>
        </div>
      </CardModalSection>
    </div>
  );
}
