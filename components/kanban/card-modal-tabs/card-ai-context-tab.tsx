"use client";

import { useCallback, useState } from "react";
import { useCardModal } from "@/components/kanban/card-modal-context";
import { CardModalSection } from "@/components/kanban/card-modal-section";
import type { CardModalTabBaseProps } from "@/components/kanban/card-modal-tabs/types";
import { apiPost, ApiError, getApiHeaders } from "@/lib/api-client";

type EpicAction = "idle" | "decompose" | "briefing";

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
    boardId,
    getHeaders,
    mode,
    selfId,
    assigneeId,
    onBoardReloaded,
    pushToast,
  } = useCardModal();

  const [epicAction, setEpicAction] = useState<EpicAction>("idle");

  const canPersistServerCard = mode === "edit" && Boolean(selfId.trim());
  const canBriefing = canPersistServerCard && Boolean(assigneeId.trim());
  const epicBusy = epicAction !== "idle";

  const runDecomposeEpic = useCallback(async () => {
    if (!canPersistServerCard || epicBusy) return;
    setEpicAction("decompose");
    try {
      await apiPost(
        `/api/boards/${encodeURIComponent(boardId)}/cards/${encodeURIComponent(selfId)}/decompose-epic`,
        {},
        getApiHeaders(getHeaders())
      );
      pushToast({ kind: "success", title: t("cardModal.aiTab.decomposeSuccess") });
      await onBoardReloaded?.(selfId);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : t("cardModal.aiTab.epicActionsError");
      pushToast({ kind: "error", title: msg });
    } finally {
      setEpicAction("idle");
    }
  }, [boardId, canPersistServerCard, epicBusy, getHeaders, onBoardReloaded, pushToast, selfId, t]);

  const runAssigneeBriefing = useCallback(async () => {
    if (!canBriefing || epicBusy) return;
    setEpicAction("briefing");
    try {
      await apiPost(
        `/api/boards/${encodeURIComponent(boardId)}/cards/${encodeURIComponent(selfId)}/assignee-briefing`,
        { assigneeId: assigneeId.trim() },
        getApiHeaders(getHeaders())
      );
      pushToast({ kind: "success", title: t("cardModal.aiTab.briefingSuccess") });
      await onBoardReloaded?.(selfId);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : t("cardModal.aiTab.epicActionsError");
      pushToast({ kind: "error", title: msg });
    } finally {
      setEpicAction("idle");
    }
  }, [
    assigneeId,
    boardId,
    canBriefing,
    epicBusy,
    getHeaders,
    onBoardReloaded,
    pushToast,
    selfId,
    t,
  ]);

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

      <CardModalSection title={t("cardModal.aiTab.epicSectionTitle")} description={t("cardModal.aiTab.epicSectionHint")}>
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={runDecomposeEpic}
            disabled={!canPersistServerCard || epicBusy}
            className="btn-secondary disabled:opacity-45 disabled:pointer-events-none"
          >
            {epicAction === "decompose" ? t("cardModal.aiTab.decomposeEpicBusy") : t("cardModal.aiTab.decomposeEpic")}
          </button>
          <button
            type="button"
            onClick={runAssigneeBriefing}
            disabled={!canBriefing || epicBusy}
            className="btn-secondary disabled:opacity-45 disabled:pointer-events-none"
          >
            {epicAction === "briefing" ? t("cardModal.aiTab.assigneeBriefingBusy") : t("cardModal.aiTab.assigneeBriefing")}
          </button>
        </div>
        {!canPersistServerCard ? (
          <p className="text-xs text-[var(--flux-text-muted)] pt-1">{t("cardModal.aiTab.needSavedCard")}</p>
        ) : null}
        {canPersistServerCard && !assigneeId.trim() ? (
          <p className="text-xs text-[var(--flux-text-muted)] pt-1">{t("cardModal.aiTab.needAssignee")}</p>
        ) : null}
      </CardModalSection>

      {(aiContextPhase === "done" && aiContextApplied) || aiContextBusinessSummary || aiContextObjective ? (
        <CardModalSection title={t("cardModal.aiTab.lastResult")}>
          {aiContextApplied ? (
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] border font-semibold ${
                aiContextApplied.usedLlm
                  ? "bg-[var(--flux-primary-alpha-12)] border-[var(--flux-primary-alpha-35)] text-[var(--flux-primary-light)]"
                  : "bg-[var(--flux-chrome-alpha-04)] border-[var(--flux-chrome-alpha-12)] text-[var(--flux-text-muted)]"
              }`}
            >
              {aiContextApplied.usedLlm ? t("cardModal.badges.aiGenerated") : t("cardModal.badges.aiFallbackStructured")}
            </span>
          ) : null}
          {(aiContextBusinessSummary || aiContextObjective) && (
            <div className="rounded-[10px] border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-chrome-alpha-04)] p-3 mt-2">
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
