"use client";

import type React from "react";
import type { DailyInsightEntry } from "@/app/board/[id]/page";
import { CustomTooltip } from "@/components/ui/custom-tooltip";
import { getDailyActionSuggestions, getDailyCreateSuggestions, renderOrganizedContext } from "./daily-utils";
import { useTranslations } from "next-intl";
import { AiModelHint } from "@/components/ai-model-hint";
import { StandupSummarySection } from "./StandupSummarySection";

export type DailyTab = "entrada" | "historico" | "status";
export type DailyLogStatus = "start" | "success" | "error";
export type DailyStatusPhase = "idle" | "preparing" | "requesting" | "processing" | "done" | "error";

export type DailyLog = {
  timestamp: string;
  status: DailyLogStatus;
  message: string;
  model?: string;
  provider?: string;
  resultSnippet?: string;
  errorKind?: string;
  errorMessage?: string;
};

export type DailyInsightsPanelProps = {
  boardId: string;
  boardName: string;
  getHeaders: () => Record<string, string>;

  dailyTab: DailyTab;
  dailyGenerating: boolean;
  dailyTranscribing?: boolean;
  dailyStatusPhase: DailyStatusPhase;
  statusStepIndex: number;
  dailyLogs: DailyLog[];

  dailyTranscript: string;
  dailyFileName: string;

  dailyHistoryDateFrom: string;
  dailyHistoryDateTo: string;
  dailyHistorySearchQuery: string;

  dailyInsights: DailyInsightEntry[];
  filteredDailyInsights: DailyInsightEntry[];

  activeDailyHistoryId: string | null;
  activeCreatedCardsExpandedId: string | null;

  dailyDialogRef: React.RefObject<HTMLDivElement | null>;
  dailyCloseRef: React.RefObject<HTMLButtonElement | null>;

  slugDaily: (value: string) => string;

  onClose: () => void;
  onClickNewDaily: () => void;
  onClickHistoryTab: () => void;
  onClickStatusTab: () => void;

  onLoadDailyTranscriptFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onTranscribeDailyRecording: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearDailyAttachmentAndTranscript: () => void;
  onDailyTranscriptChange: (value: string) => void;
  onGenerateDailyInsight: () => void | Promise<void>;
  onGenerateDailyInsightAndCreateCards: () => void | Promise<void>;
  onClearDailyLogs: () => void;

  onOpenDailyHistoryFromStatusEntry: (entryId: string) => void;

  onSetDailyHistoryDateFrom: (value: string) => void;
  onSetDailyHistoryDateTo: (value: string) => void;
  onSetDailyHistorySearchQuery: (value: string) => void;
  onClearDailyHistoryFilters: () => void;

  onToggleDailyHistoryExpanded: (entryId: string) => void;
  onCollapseDailyHistoryExpanded: () => void;

  onDownloadDailyContextDoc: (entry: DailyInsightEntry) => void;
  onCopyDailyContextDoc: (entry: DailyInsightEntry) => void | Promise<void>;
  onCreateCardsFromInsight: (entryId?: string) => void;
  onDeleteDailyHistoryEntry: (entryId: string) => void;
  onExpandDailyHistoryCreatedCards: (entryId: string) => void;
};

export function DailyInsightsPanel(props: DailyInsightsPanelProps) {
  const {
    boardId,
    boardName,
    getHeaders,
    dailyTab,
    dailyGenerating,
    dailyTranscribing = false,
    dailyStatusPhase,
    statusStepIndex,
    dailyLogs,
    dailyTranscript,
    dailyFileName,
    dailyHistoryDateFrom,
    dailyHistoryDateTo,
    dailyHistorySearchQuery,
    dailyInsights,
    filteredDailyInsights,
    activeDailyHistoryId,
    activeCreatedCardsExpandedId,
    dailyDialogRef,
    dailyCloseRef,
    slugDaily,
    onClose,
    onClickNewDaily,
    onClickHistoryTab,
    onClickStatusTab,
    onLoadDailyTranscriptFile,
    onTranscribeDailyRecording,
    onClearDailyAttachmentAndTranscript,
    onDailyTranscriptChange,
    onGenerateDailyInsight,
    onGenerateDailyInsightAndCreateCards,
    onClearDailyLogs,
    onOpenDailyHistoryFromStatusEntry,
    onSetDailyHistoryDateFrom,
    onSetDailyHistoryDateTo,
    onSetDailyHistorySearchQuery,
    onClearDailyHistoryFilters,
    onToggleDailyHistoryExpanded,
    onCollapseDailyHistoryExpanded,
    onDownloadDailyContextDoc,
    onCopyDailyContextDoc,
    onCreateCardsFromInsight,
    onDeleteDailyHistoryEntry,
    onExpandDailyHistoryCreatedCards,
  } = props;

  const t = useTranslations("kanban");

  return (
    <div
      className="fixed inset-0 bg-[var(--flux-backdrop-scrim-strong)] z-[var(--flux-z-daily-insights)] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl h-[90vh] bg-[var(--flux-surface-card)] border border-[var(--flux-chrome-alpha-12)] rounded-[var(--flux-rad)] p-5 flex flex-col"
        onClick={(e) => e.stopPropagation()}
        ref={dailyDialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="daily-ia-title"
        tabIndex={-1}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 id="daily-ia-title" className="font-display font-bold text-[var(--flux-text)] text-base">
              {t("daily.title")}
            </h3>
            <p className="text-xs text-[var(--flux-text-muted)]">
              {t("daily.boardLabel", { boardName: boardName || t("daily.boardFallback") })}
            </p>
          </div>
          <button ref={dailyCloseRef} type="button" className="btn-secondary" onClick={onClose}>
            {t("daily.close")}
          </button>
        </div>

        <div className="flex items-center gap-2 mb-3 border-b border-[var(--flux-chrome-alpha-08)] pb-3">
          <button
            type="button"
            className={`btn-bar ${dailyTab === "entrada" ? "!border-[var(--flux-primary)] !text-[var(--flux-primary-light)]" : ""}`}
            onClick={onClickNewDaily}
          >
            {t("daily.tabs.new")}
          </button>
          <button
            type="button"
            className={`btn-bar ${dailyTab === "historico" ? "!border-[var(--flux-primary)] !text-[var(--flux-primary-light)]" : ""}`}
            onClick={onClickHistoryTab}
          >
            {t("daily.tabs.history")} ({dailyInsights.length})
          </button>
          <button
            type="button"
            className={`btn-bar ${dailyTab === "status" ? "!border-[var(--flux-primary)] !text-[var(--flux-primary-light)]" : ""}`}
            onClick={onClickStatusTab}
          >
            {t("daily.tabs.status")}
            {dailyGenerating ? ` ${t("daily.tabs.statusInProgressSuffix")}` : ""}
          </button>
        </div>

        {dailyTab === "entrada" ? (
          <div className="flex-1 min-h-0 overflow-auto">
            <p className="text-xs text-[var(--flux-text-muted)] mb-3">
              {t("daily.entry.description")}
            </p>
            {(dailyGenerating || dailyTranscribing) && (
              <div className="mb-3 rounded-[10px] border border-[var(--flux-primary-alpha-35)] bg-[var(--flux-primary-alpha-12)] px-3 py-2">
                <p className="text-xs text-[var(--flux-primary-light)] font-semibold">
                  {dailyTranscribing
                    ? t("daily.entry.transcribing.title")
                    : t("daily.entry.generating.title")}
                </p>
                <p className="text-[11px] text-[var(--flux-text-muted)] mt-1">
                  {dailyTranscribing
                    ? t("daily.entry.transcribing.description")
                    : t("daily.entry.generating.description")}
                </p>
                {dailyTranscribing && (
                  <div className="mt-2 h-1.5 rounded-full bg-[var(--flux-chrome-alpha-08)] overflow-hidden">
                    <div className="h-full w-[45%] bg-[linear-gradient(90deg,var(--flux-primary),var(--flux-secondary))] animate-pulse" />
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <label className="btn-bar cursor-pointer">
                {t("daily.entry.attachLabel")}
                <input type="file" accept=".txt,.md,.log,.csv" className="hidden" onChange={onLoadDailyTranscriptFile} />
              </label>
              <label className="btn-bar cursor-pointer border-[var(--flux-teal-alpha-35)] bg-[var(--flux-teal-alpha-08)]">
                {t("daily.entry.uploadRecordingLabel")}
                <input
                  type="file"
                  accept="audio/mpeg,audio/mp3,audio/wav,audio/webm,.mp3,.wav,.webm"
                  className="hidden"
                  onChange={onTranscribeDailyRecording}
                />
              </label>
              <button type="button" className="btn-secondary" onClick={onClearDailyAttachmentAndTranscript}>
                {t("daily.entry.clearAttachmentButton")}
              </button>
              <span className="text-xs text-[var(--flux-text-muted)]">{dailyFileName}</span>
            </div>
            <div className="mb-2">
              <div className="text-[11px] uppercase tracking-wide font-bold text-[var(--flux-primary-light)]">
                {t("daily.entry.transcriptPreviewLabel")}
              </div>
              <p className="text-[11px] text-[var(--flux-text-muted)] mt-0.5">{t("daily.entry.transcriptPreviewHint")}</p>
            </div>
            <textarea
              value={dailyTranscript}
              onChange={(e) => onDailyTranscriptChange(e.target.value)}
              placeholder={t("daily.entry.transcriptPlaceholder")}
              className="w-full min-h-[260px] p-3 rounded-[10px] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-mid)] text-[var(--flux-text)] text-sm outline-none focus:border-[var(--flux-primary)]"
            />
            <div className="flex items-center gap-2 justify-end mt-3 flex-wrap">
              <button type="button" className="btn-secondary" onClick={onClose}>
                {t("daily.entry.close")}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={onGenerateDailyInsight}
                disabled={dailyGenerating || dailyTranscribing}
              >
                {dailyGenerating ? t("daily.entry.generateButton.generating") : t("daily.entry.generateButton.idle")}
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={onGenerateDailyInsightAndCreateCards}
                disabled={dailyGenerating || dailyTranscribing}
              >
                {dailyGenerating ? t("daily.entry.generateAndCardsButton.generating") : t("daily.entry.generateAndCardsButton.idle")}
              </button>
            </div>
          </div>
        ) : dailyTab === "status" ? (
          <div className="flex-1 min-h-0 overflow-auto">
            <div className="mb-3 rounded-[10px] border border-[var(--flux-primary-alpha-28)] bg-[var(--flux-surface-mid)] p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="text-xs font-semibold text-[var(--flux-primary-light)]">
                  {t("daily.status.trackingTitle")}
                </div>
                <div className="text-[11px] text-[var(--flux-text-muted)]">
                  {dailyGenerating
                    ? t("daily.status.phase.busy")
                    : dailyStatusPhase === "done"
                      ? t("daily.status.phase.done")
                      : dailyStatusPhase === "error"
                        ? t("daily.status.phase.error")
                        : dailyStatusPhase === "idle"
                          ? t("daily.status.phase.idle")
                          : t("daily.status.phase.waiting")}
                </div>
              </div>
              <div className="h-2 rounded-full bg-[var(--flux-chrome-alpha-08)] overflow-hidden">
                <div
                  className="h-full bg-[linear-gradient(90deg,var(--flux-primary),var(--flux-secondary))] transition-all duration-700 ease-out"
                  style={{
                    width: `${dailyStatusPhase === "idle" ? 0 : Math.max(6, Math.min(100, statusStepIndex * 25))}%`,
                    opacity: dailyGenerating ? 0.95 : 0.8,
                  }}
                />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 mt-2">
                {[t("daily.status.steps.preparing"), t("daily.status.steps.sending"), t("daily.status.steps.processing"), t("daily.status.steps.done")].map(
                  (step, idx) => {
                  const stepPos = idx + 1;
                  const active = statusStepIndex >= stepPos;
                  return (
                    <div
                      key={step}
                      className={`text-[10px] rounded-[6px] px-2 py-1 border ${
                        active
                          ? "border-[var(--flux-primary-alpha-45)] text-[var(--flux-primary-light)] bg-[var(--flux-primary-alpha-12)]"
                          : "border-[var(--flux-chrome-alpha-10)] text-[var(--flux-text-muted)]"
                      }`}
                    >
                      {step}
                    </div>
                  );
                  }
                )}
              </div>
            </div>

            {dailyGenerating ? (
              dailyLogs.length > 0 ? (
                <div className="mt-4 bg-[var(--flux-surface-mid)] border border-[var(--flux-primary-alpha-35)] rounded-[10px] p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="text-[11px] uppercase tracking-wide font-bold text-[var(--flux-primary-light)]">
                      {t("daily.status.log.title")}
                    </div>
                    <button
                      type="button"
                      className="text-[10px] text-[var(--flux-text-muted)] hover:text-[var(--flux-primary-light)] underline-offset-2 hover:underline"
                      onClick={onClearDailyLogs}
                    >
                      {t("daily.status.log.clearButton")}
                    </button>
                  </div>
                  <div className="max-h-40 overflow-auto space-y-1 scrollbar-flux">
                    {dailyLogs.map((log, index) => {
                      const dt = new Date(log.timestamp).toLocaleTimeString("pt-BR");
                      const baseClass =
                        log.status === "success"
                          ? "text-[var(--flux-primary-light)]"
                          : log.status === "error"
                            ? "text-[var(--flux-danger-bright)]"
                            : "text-[var(--flux-text-muted)]";
                      return (
                        <div key={`${log.timestamp}-${index}`} className="text-[11px] flex items-start gap-2">
                          <span className="text-[10px] text-[var(--flux-text-muted)] min-w-[54px]">{dt}</span>
                          <div className={`flex-1 ${baseClass} space-y-0.5`}>
                            <div>{log.message}</div>
                            {(log.provider || log.model) && (
                              <div className="text-[10px] text-[var(--flux-text-muted)]">
                                {log.provider && (
                                  <span>
                                    {t("daily.status.log.llmPrefix")} {log.provider}
                                  </span>
                                )}
                                {log.provider && log.model && <span> • </span>}
                                {log.model && (
                                  <span>
                                    {t("daily.status.log.modelPrefix")} {log.model}
                                  </span>
                                )}
                              </div>
                            )}
                            {log.errorKind && (
                              <div className="text-[10px] text-[var(--flux-text-muted)]">
                                {t("daily.status.log.errorPrefix")} {log.errorKind}
                                {log.errorMessage ? ` - ${log.errorMessage}` : ""}
                              </div>
                            )}
                            {log.resultSnippet && (
                              <div className="text-[10px] text-[var(--flux-text-muted)] whitespace-pre-wrap">
                                {log.resultSnippet}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-[var(--flux-text-muted)] mt-4">
                  {t("daily.status.log.emptyMessage")}
                </p>
              )
            ) : (
              <div className="mt-4 bg-[var(--flux-surface-mid)] border border-[var(--flux-primary-alpha-35)] rounded-[10px] p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="text-[11px] uppercase tracking-wide font-bold text-[var(--flux-primary-light)]">
                    {t("daily.status.exec.title")}
                  </div>
                  <span className="text-[10px] text-[var(--flux-text-muted)]">
                    {t("daily.status.exec.linkedToHistory")}
                  </span>
                </div>
                {dailyInsights.length ? (
                  <div className="space-y-2">
                    {dailyInsights.slice(0, 8).map((entry, idx) => {
                      const insight = entry?.insight;
                      const entryId = String(entry?.id || "");
                      if (!entryId || !insight) return null;

                      const generatedWithAi = Boolean(entry?.generationMeta?.usedLlm);
                      const gm = entry?.generationMeta as { model?: string; provider?: string } | undefined;
                      const label = generatedWithAi ? t("daily.status.exec.label.done") : t("daily.status.exec.label.doneHeuristic");
                      const createdAt = entry?.createdAt ? new Date(entry.createdAt).toLocaleString("pt-BR") : "";
                      const resumo = String(insight?.resumo || "").trim();
                      const resumoShort = resumo.length > 120 ? `${resumo.slice(0, 120)}...` : resumo;

                      return (
                        <button
                          key={entryId || idx}
                          type="button"
                          className="w-full text-left p-2 rounded-[8px] border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-card)] hover:border-[var(--flux-primary-alpha-35)] hover:bg-[var(--flux-primary-alpha-08)] transition-colors"
                          onClick={() => onOpenDailyHistoryFromStatusEntry(entryId)}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[11px] font-semibold text-[var(--flux-primary-light)]">{label}</span>
                                {generatedWithAi && (
                                  <span className="text-[9px] font-semibold px-1.5 py-[1px] rounded-full border border-[var(--flux-primary-alpha-50)] text-[var(--flux-primary-light)]">
                                    {t("daily.badges.ai")}
                                  </span>
                                )}
                                {gm?.model || gm?.provider ? (
                                  <AiModelHint model={gm?.model} provider={gm?.provider} />
                                ) : null}
                              </div>
                              <div className="text-[11px] text-[var(--flux-text-muted)] mt-1 truncate">
                                {resumoShort || t("daily.status.exec.noSummary")}
                              </div>
                            </div>
                            <div className="text-[10px] text-[var(--flux-text-muted)] whitespace-nowrap">{createdAt}</div>
                          </div>
                          <div className="mt-2 text-[10px] text-[var(--flux-text-muted)] underline underline-offset-2">
                            {t("daily.status.exec.openInHistory")}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-[var(--flux-text-muted)]">{t("daily.status.exec.noneYet")}</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-auto space-y-3">
            {dailyInsights.length ? (
              <>
                <div className="bg-[var(--flux-surface-mid)] border border-[var(--flux-chrome-alpha-08)] rounded-[12px] p-3">
                  <div className="flex items-end gap-2 flex-wrap">
                    <div className="min-w-[160px]">
                      <label className="text-[11px] uppercase tracking-wide font-bold text-[var(--flux-primary-light)] block mb-1">
                        {t("daily.history.filters.fromLabel")}
                      </label>
                      <input
                        type="date"
                        value={dailyHistoryDateFrom}
                        onChange={(e) => onSetDailyHistoryDateFrom(e.target.value)}
                        className="w-full px-2 py-1 rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] text-xs bg-[var(--flux-surface-card)] text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                      />
                    </div>
                    <div className="min-w-[160px]">
                      <label className="text-[11px] uppercase tracking-wide font-bold text-[var(--flux-primary-light)] block mb-1">
                        {t("daily.history.filters.toLabel")}
                      </label>
                      <input
                        type="date"
                        value={dailyHistoryDateTo}
                        onChange={(e) => onSetDailyHistoryDateTo(e.target.value)}
                        className="w-full px-2 py-1 rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] text-xs bg-[var(--flux-surface-card)] text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                      />
                    </div>
                    <div className="flex-1 min-w-[220px]">
                      <label className="text-[11px] uppercase tracking-wide font-bold text-[var(--flux-primary-light)] block mb-1">
                        {t("daily.history.filters.searchLabel")}
                      </label>
                      <input
                        type="text"
                        value={dailyHistorySearchQuery}
                        onChange={(e) => onSetDailyHistorySearchQuery(e.target.value)}
                        placeholder={t("daily.history.filters.searchPlaceholder")}
                        className="w-full px-2 py-1 rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] text-xs bg-[var(--flux-surface-card)] text-[var(--flux-text)] placeholder-[var(--flux-text-muted)] outline-none focus:border-[var(--flux-primary)]"
                      />
                    </div>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={onClearDailyHistoryFilters}
                    >
                      {t("daily.history.filters.clearButton")}
                    </button>
                  </div>
                  <p className="text-[11px] text-[var(--flux-text-muted)] mt-2">
                    {t("daily.history.filters.countText", {
                      filtered: filteredDailyInsights.length,
                      total: dailyInsights.length,
                    })}
                  </p>
                </div>

                {filteredDailyInsights.length > 0 && (
                  <div className="mt-3 bg-[var(--flux-surface-card)] border border-[var(--flux-chrome-alpha-08)] rounded-[10px] p-2">
                    <div className="text-[11px] uppercase tracking-wide font-bold text-[var(--flux-primary-light)] mb-1">
                      {t("daily.history.list.title")}
                    </div>
                    <div className="max-h-40 overflow-auto scrollbar-flux divide-y divide-[var(--flux-chrome-alpha-06)]">
                      {filteredDailyInsights.map((entry, idx) => {
                        const insight = entry.insight;
                        if (!insight) return null;
                        const dt = entry.createdAt ? new Date(entry.createdAt).toLocaleString("pt-BR") : "";
                        const createItems = getDailyCreateSuggestions(entry);
                        const generatedWithAi = Boolean(entry?.generationMeta?.usedLlm);
                        const entryId = String(entry.id || "");
                        const isActive = activeDailyHistoryId === entryId;

                        return (
                          <button
                            key={entry.id || idx}
                            type="button"
                            onClick={() => {
                              if (!entryId) return;
                              onToggleDailyHistoryExpanded(entryId);
                            }}
                            className={`w-full flex items-center justify-between gap-2 py-1.5 px-1.5 text-left transition-colors ${
                              isActive
                                ? "bg-[var(--flux-primary-alpha-16)]"
                                : "hover:bg-[var(--flux-primary-alpha-08)]"
                            }`}
                          >
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <span className="text-[11px] font-semibold text-[var(--flux-text)] truncate">
                                {insight.resumo || t("daily.history.list.item.noTitle")}
                              </span>
                              <span className="text-[10px] text-[var(--flux-text-muted)]">
                                {dt || t("daily.history.list.item.noDate")} •{" "}
                                {t("daily.history.list.item.createCountText", { count: createItems.length })}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {generatedWithAi && (
                                <span className="text-[9px] font-semibold px-1.5 py-[1px] rounded-full border border-[var(--flux-primary-alpha-50)] text-[var(--flux-primary-light)]">
                                  {t("daily.badges.ai")}
                                </span>
                              )}
                              <span className="text-[10px] text-[var(--flux-text-muted)]">
                                #{filteredDailyInsights.length - idx}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {filteredDailyInsights.map((entry, idx) => {
                  const insight = entry.insight;
                  if (!insight) return null;
                  const dt = entry.createdAt ? new Date(entry.createdAt).toLocaleString("pt-BR") : "";
                  const title =
                    idx === 0
                      ? t("daily.history.entry.title.latest")
                      : t("daily.history.entry.title.history", {
                          index: filteredDailyInsights.length - idx,
                        });
                  const createItems = getDailyCreateSuggestions(entry);
                  const entryId = String(entry.id || "");
                  const isExpanded = activeDailyHistoryId === entryId;
                  const sourceName = String(
                    entry.sourceFileName || t("daily.history.entry.sourceManualFallback")
                  );
                  const generatedWithAi = Boolean(entry?.generationMeta?.usedLlm);
                  const aiModel = String(entry?.generationMeta?.model || "").trim();

                  return (
                    <div
                      key={entry.id || idx}
                      className={`bg-[var(--flux-surface-mid)] border rounded-[12px] p-3 transition-colors ${
                        isExpanded ? "border-[var(--flux-primary-alpha-35)]" : "border-[var(--flux-chrome-alpha-08)]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <button
                          type="button"
                          className="flex items-center gap-2 text-left"
                          onClick={() => {
                            if (!entryId) return;
                            onToggleDailyHistoryExpanded(entryId);
                          }}
                        >
                          <span className="w-2 h-2 rounded-full bg-[var(--flux-primary)] shadow-[var(--flux-shadow-primary-dot)]" />
                          <h4 className="font-display font-bold text-sm text-[var(--flux-text)]">
                            {title}
                            {dt ? ` • ${dt}` : ""}
                          </h4>
                          <span className="text-[10px] text-[var(--flux-text-muted)]">
                            {isExpanded ? t("daily.history.entry.expand.opened") : t("daily.history.entry.expand.collapsed")}
                          </span>
                        </button>

                        {isExpanded ? (
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onCollapseDailyHistoryExpanded();
                            }}
                          >
                            {t("daily.history.entry.collapseButton")}
                          </button>
                        ) : (
                          <span className="text-[10px] text-[var(--flux-text-muted)]">{sourceName}</span>
                        )}
                      </div>

                      <div
                        className={`overflow-hidden transition-all duration-300 ease-in-out ${
                          isExpanded ? "max-h-[2400px] opacity-100 mt-2" : "max-h-0 opacity-0 mt-0"
                        }`}
                        aria-hidden={!isExpanded}
                      >
                        <div>
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            <button type="button" className="btn-bar" onClick={() => onDownloadDailyContextDoc(entry)}>
                              {t("daily.history.entry.actions.downloadContext")}
                            </button>
                            <button type="button" className="btn-bar" onClick={() => onCopyDailyContextDoc(entry)}>
                              {t("daily.history.entry.actions.copyContext")}
                            </button>
                            <button type="button" className="btn-bar" onClick={() => onCreateCardsFromInsight(entry.id)}>
                              {t("daily.history.entry.actions.createCardsFrom")}
                            </button>
                            <button
                              type="button"
                              className="btn-danger-solid"
                              onClick={() => onDeleteDailyHistoryEntry(String(entry.id || ""))}
                            >
                              {t("daily.history.entry.actions.deleteSummary")}
                            </button>
                          </div>
                          <p className="text-[11px] text-[var(--flux-text-muted)] mt-2">
                            {t("daily.history.entry.meta.sourcePrefix")} {sourceName}
                            {entry.transcript
                              ? t("daily.history.entry.meta.processedChars", {
                                  count: entry.transcript.length,
                                })
                              : ""}
                          </p>

                          {generatedWithAi && (
                            <CustomTooltip content={t("daily.history.entry.tooltips.rewritten")}>
                              <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-[var(--flux-primary-alpha-35)] bg-[var(--flux-primary-alpha-14)] px-2 py-1">
                                <span className="h-1.5 w-1.5 rounded-full bg-[var(--flux-primary)] shadow-[var(--flux-shadow-primary-dot-sm)]" />
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--flux-primary-light)]">
                                  {t("daily.history.entry.badges.aiGeneratedText")}
                                  {aiModel ? ` • ${aiModel}` : ""}
                                </span>
                              </div>
                            </CustomTooltip>
                          )}

                          <p className="text-xs text-[var(--flux-text-muted)] mt-2">{insight.resumo || ""}</p>

                          <div className="mt-2 mb-2 bg-[var(--flux-surface-card)] border border-[var(--flux-chrome-alpha-08)] rounded-[8px] p-2">
                            <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                              <div className="text-[11px] uppercase tracking-wide font-bold text-[var(--flux-primary-light)]">
                                {t("daily.history.entry.context.organizedTitle")}
                              </div>
                              {generatedWithAi && (
                                <div className="text-[10px] font-semibold text-[var(--flux-primary-light)]/90">
                                  {t("daily.history.entry.context.organizedByAi")}
                                </div>
                              )}
                            </div>
                            {renderOrganizedContext(String(insight.contextoOrganizado || ""))}
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {[
                              { key: "criar", label: t("daily.lists.create"), values: createItems },
                              { key: "ajustar", label: t("daily.lists.adjust"), values: getDailyActionSuggestions(insight.ajustar) },
                              { key: "corrigir", label: t("daily.lists.correct"), values: getDailyActionSuggestions(insight.corrigir) },
                              { key: "pendencias", label: t("daily.lists.pending"), values: getDailyActionSuggestions(insight.pendencias) },
                            ].map((list) => (
                              <div
                                key={list.key}
                                className="bg-[var(--flux-surface-card)] border border-[var(--flux-chrome-alpha-08)] rounded-[8px] p-2"
                              >
                                <div className="text-[11px] uppercase tracking-wide font-bold text-[var(--flux-primary-light)] mb-1">
                                  {list.label}
                                </div>
                                {list.values.length ? (
                                  <ul className="space-y-1 pl-4 list-disc">
                                    {list.values.map((item, i) => {
                                      const prioSlug = slugDaily(item.prioridade);
                                      const progSlug = slugDaily(item.progresso);
                                      const prioClass =
                                        prioSlug === "urgente"
                                          ? "bg-[var(--flux-danger-alpha-12)] text-[var(--flux-danger-accent)] border-[var(--flux-danger-alpha-30)]"
                                          : prioSlug === "importante"
                                            ? "bg-[var(--flux-warning-alpha-12)] text-[var(--flux-warning-foreground)] border-[var(--flux-warning-alpha-30)]"
                                            : "bg-[var(--flux-info-alpha-12)] text-[var(--flux-info)] border-[var(--flux-info-alpha-30)]";
                                      const progClass =
                                        progSlug === "em-andamento"
                                          ? "bg-[var(--flux-teal-alpha-12)] text-[var(--flux-teal-foreground)] border-[var(--flux-teal-alpha-35)]"
                                          : progSlug === "concluida"
                                            ? "bg-[var(--flux-emerald-alpha-12)] text-[var(--flux-success)] border-[var(--flux-emerald-alpha-35)]"
                                            : "bg-[var(--flux-surface-mid)] text-[var(--flux-text-muted)] border-[var(--flux-chrome-alpha-12)]";

                                      return (
                                        <li key={`${list.key}-${i}`}>
                                          <div className="rounded-[8px] border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-mid)] p-2">
                                            <div className="flex items-start justify-between gap-2">
                                              <span className="flex-1 min-w-0 text-xs font-semibold text-[var(--flux-text)] leading-[1.35]">
                                                {String(item.titulo || "")}
                                              </span>
                                              <span className="flex gap-1 flex-wrap justify-end">
                                                <span
                                                  className={`text-[9px] font-bold px-1.5 py-[1px] rounded-full border whitespace-nowrap ${prioClass}`}
                                                >
                                                  {t("daily.history.entry.listItem.prioPrefix")} {item.prioridade}
                                                </span>
                                                <span
                                                  className={`text-[9px] font-bold px-1.5 py-[1px] rounded-full border whitespace-nowrap ${progClass}`}
                                                >
                                                  {t("daily.history.entry.listItem.progressPrefix")} {item.progresso}
                                                </span>
                                              </span>
                                            </div>

                                            {item.descricao && (
                                              <p className="mt-1 text-[11px] text-[var(--flux-text-muted)] leading-relaxed whitespace-pre-line">
                                                {item.descricao}
                                              </p>
                                            )}

                                            <div className="mt-1 flex flex-wrap gap-1">
                                              {item.coluna && (
                                                <span className="text-[9px] font-semibold px-1.5 py-[1px] rounded-full border border-[var(--flux-chrome-alpha-14)] text-[var(--flux-text-muted)]">
                                                  {t("daily.history.entry.listItem.columnPrefix")} {item.coluna}
                                                </span>
                                              )}
                                              {item.dataConclusao && (
                                                <span className="text-[9px] font-semibold px-1.5 py-[1px] rounded-full border border-[var(--flux-chrome-alpha-14)] text-[var(--flux-text-muted)]">
                                                  {t("daily.history.entry.listItem.duePrefix")} {item.dataConclusao}
                                                </span>
                                              )}
                                              {item.tags?.map((tag) => (
                                                <span
                                                  key={`${item.titulo}-${tag}`}
                                                  className="text-[9px] font-semibold px-1.5 py-[1px] rounded-full border border-[var(--flux-primary-alpha-35)] text-[var(--flux-primary-light)]"
                                                >
                                                  {tag}
                                                </span>
                                              ))}
                                            </div>
                                          </div>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                ) : (
                                  <p className="text-xs text-[var(--flux-text-muted)]">{t("daily.history.entry.list.emptyMessage")}</p>
                                )}
                              </div>
                            ))}
                          </div>

                          <div className="mt-3 bg-[var(--flux-surface-card)] border border-[var(--flux-chrome-alpha-08)] rounded-[8px] p-2">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="text-[11px] uppercase tracking-wide font-bold text-[var(--flux-primary-light)]">
                                {t("daily.history.entry.createdCards.title")}
                              </div>
                              <button
                                type="button"
                                className="btn-bar"
                                onClick={() => onExpandDailyHistoryCreatedCards(String(entry.id || ""))}
                              >
                                {activeCreatedCardsExpandedId === String(entry.id || "")
                                  ? t("daily.history.entry.createdCards.detailsOpen")
                                  : t("daily.history.entry.createdCards.viewAll")}
                              </button>
                            </div>
                            <p className="text-xs text-[var(--flux-text-muted)] mt-1">
                              {t("daily.history.entry.createdCards.countText", {
                                count: Array.isArray(entry.createdCards) ? entry.createdCards.length : 0,
                              })}
                            </p>
                            <div
                              className={`overflow-hidden transition-all duration-300 ease-in-out ${
                                activeCreatedCardsExpandedId === String(entry.id || "")
                                  ? "max-h-[1400px] opacity-100 mt-2"
                                  : "max-h-0 opacity-0 mt-0"
                              }`}
                              aria-hidden={activeCreatedCardsExpandedId !== String(entry.id || "")}
                            >
                              <div className="space-y-2">
                                {Array.isArray(entry.createdCards) && entry.createdCards.length ? (
                                  entry.createdCards.map((createdCard, createdIdx) => (
                                    <div
                                      key={`${createdCard.cardId || "card"}-${createdIdx}`}
                                      className="border border-[var(--flux-chrome-alpha-08)] rounded-[8px] p-2 bg-[var(--flux-surface-mid)]"
                                    >
                                      <div className="text-xs font-semibold text-[var(--flux-text)]">
                                        {createdCard.title || t("daily.history.entry.createdCards.card.noTitle")}
                                        {createdCard.status === "existing" && (
                                          <span className="ml-2 text-[10px] font-bold px-1.5 py-[1px] rounded-full border border-[var(--flux-warning-alpha-30)] text-[var(--flux-warning-foreground)] bg-[var(--flux-warning-alpha-12)]">
                                            {t("daily.history.entry.createdCards.card.alreadyExists")}
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[11px] text-[var(--flux-text-muted)] mt-1">
                                        {t("daily.history.entry.createdCards.card.idPrefix")} {createdCard.cardId} •{" "}
                                        {t("daily.history.entry.createdCards.card.columnPrefix")} {createdCard.bucket} •{" "}
                                        {t("daily.history.entry.createdCards.card.priorityPrefix")} {createdCard.priority} •{" "}
                                        {t("daily.history.entry.createdCards.card.progressPrefix")} {createdCard.progress}
                                      </div>
                                      <div className="text-[11px] text-[var(--flux-text-muted)] mt-1">
                                        {t("daily.history.entry.createdCards.card.directionPrefix")}{" "}
                                        {createdCard.direction || t("daily.history.entry.createdCards.card.noValue")} •{" "}
                                        {t("daily.history.entry.createdCards.card.datePrefix")}{" "}
                                        {createdCard.createdAt
                                          ? new Date(createdCard.createdAt).toLocaleString("pt-BR")
                                          : t("daily.history.entry.createdCards.card.noValue")}
                                      </div>
                                      <div className="text-[11px] text-[var(--flux-text-muted)] mt-1">
                                        {t("daily.history.entry.createdCards.card.tagsPrefix")}{" "}
                                        {Array.isArray(createdCard.tags) && createdCard.tags.length
                                          ? createdCard.tags.join(", ")
                                          : t("daily.history.entry.createdCards.card.noValue")}
                                      </div>
                                      <p className="text-xs text-[var(--flux-text)] mt-1 whitespace-pre-line">
                                        {createdCard.desc || t("daily.history.entry.createdCards.card.noDescription")}
                                      </p>
                                    </div>
                                  ))
                                ) : (
                                  <p className="text-xs text-[var(--flux-text-muted)]">
                                    {t("daily.history.entry.createdCards.card.noneYet")}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {!filteredDailyInsights.length && (
                  <p className="text-xs text-[var(--flux-text-muted)]">
                    {t("daily.history.emptyNoMatches")}
                  </p>
                )}

                <StandupSummarySection
                  boardId={boardId}
                  dailyInsights={dailyInsights}
                  getHeaders={getHeaders}
                  onCreateCardsFromInsight={onCreateCardsFromInsight}
                />
              </>
            ) : (
              <p className="text-xs text-[var(--flux-text-muted)]">{t("daily.history.emptyNoSummaryYet")}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

