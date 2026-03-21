"use client";

import { useCardModal } from "@/components/kanban/card-modal-context";
import { CardModalSection } from "@/components/kanban/card-modal-section";
import type { CardModalTabBaseProps } from "@/components/kanban/card-modal-tabs/types";

export default function CardAiContextTab({ cardId: _cardId }: CardModalTabBaseProps) {
  const {
    aiContextCanGenerate,
    aiContextBusy,
    generateAiContextForCard,
    setAiContextOpen,
    aiContextPhase,
    aiContextApplied,
    aiContextBusinessSummary,
    aiContextObjective,
    t,
  } = useCardModal();

  return (
    <div className="space-y-5">
      <CardModalSection title={t("cardModal.aiTab.title")} description={t("cardModal.aiTab.description")}>
        <p className="text-sm text-[var(--flux-text-muted)] leading-relaxed">{t("cardModal.aiTab.hint")}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={generateAiContextForCard}
            disabled={!aiContextCanGenerate || aiContextBusy}
            className="btn-primary disabled:opacity-45 disabled:pointer-events-none"
          >
            {t("cardModal.aiTab.generate")}
          </button>
          <button
            type="button"
            onClick={() => setAiContextOpen(true)}
            className="btn-secondary"
          >
            {t("cardModal.aiTab.openPanel")}
          </button>
        </div>
        {!aiContextCanGenerate ? (
          <p className="text-xs text-[var(--flux-danger)]/90">{t("cardModal.aiTab.needTitleDesc")}</p>
        ) : null}
      </CardModalSection>

      {(aiContextPhase === "done" && aiContextApplied) || aiContextBusinessSummary || aiContextObjective ? (
        <CardModalSection title={t("cardModal.aiTab.lastResult")}>
          {aiContextApplied ? (
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] border font-semibold ${
                aiContextApplied.usedLlm
                  ? "bg-[rgba(108,92,231,0.12)] border-[rgba(108,92,231,0.35)] text-[var(--flux-primary-light)]"
                  : "bg-[rgba(255,255,255,0.04)] border-[rgba(255,255,255,0.12)] text-[var(--flux-text-muted)]"
              }`}
            >
              {aiContextApplied.usedLlm ? t("cardModal.badges.aiGenerated") : t("cardModal.badges.aiFallbackStructured")}
            </span>
          ) : null}
          {(aiContextBusinessSummary || aiContextObjective) && (
            <div className="rounded-[10px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] p-3 mt-2">
              {aiContextBusinessSummary ? (
                <div className="text-[11px] mb-2">
                  <span className="font-semibold text-[var(--flux-text)]">{t("cardModal.aiContext.result.businessLabel")}</span>{" "}
                  <span className="text-[var(--flux-text-muted)]">{aiContextBusinessSummary}</span>
                </div>
              ) : null}
              {aiContextObjective ? (
                <div className="text-[11px]">
                  <span className="font-semibold text-[var(--flux-text)]">{t("cardModal.aiContext.result.objectiveLabel")}</span>{" "}
                  <span className="text-[var(--flux-text-muted)]">{aiContextObjective}</span>
                </div>
              ) : null}
            </div>
          )}
        </CardModalSection>
      ) : null}
    </div>
  );
}
