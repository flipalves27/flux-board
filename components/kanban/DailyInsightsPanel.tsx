"use client";

import type React from "react";
import type { DailyInsightEntry } from "@/app/board/[id]/page";
import { CustomTooltip } from "@/components/ui/custom-tooltip";
import { getDailyActionSuggestions, getDailyCreateSuggestions, renderOrganizedContext } from "./daily-utils";

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
  boardName: string;

  dailyTab: DailyTab;
  dailyGenerating: boolean;
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
  onClearDailyAttachmentAndTranscript: () => void;
  onDailyTranscriptChange: (value: string) => void;
  onGenerateDailyInsight: () => void | Promise<void>;
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
    boardName,
    dailyTab,
    dailyGenerating,
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
    onClearDailyAttachmentAndTranscript,
    onDailyTranscriptChange,
    onGenerateDailyInsight,
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

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[410] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl h-[90vh] bg-[var(--flux-surface-card)] border border-[rgba(255,255,255,0.12)] rounded-[var(--flux-rad)] p-5 flex flex-col"
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
              Daily IA
            </h3>
            <p className="text-xs text-[var(--flux-text-muted)]">Board: {boardName || "Board"}</p>
          </div>
          <button ref={dailyCloseRef} type="button" className="btn-secondary" onClick={onClose}>
            Fechar
          </button>
        </div>

        <div className="flex items-center gap-2 mb-3 border-b border-[rgba(255,255,255,0.08)] pb-3">
          <button
            type="button"
            className={`btn-bar ${dailyTab === "entrada" ? "!border-[var(--flux-primary)] !text-[var(--flux-primary-light)]" : ""}`}
            onClick={onClickNewDaily}
          >
            Nova Daily
          </button>
          <button
            type="button"
            className={`btn-bar ${dailyTab === "historico" ? "!border-[var(--flux-primary)] !text-[var(--flux-primary-light)]" : ""}`}
            onClick={onClickHistoryTab}
          >
            Histórico ({dailyInsights.length})
          </button>
          <button
            type="button"
            className={`btn-bar ${dailyTab === "status" ? "!border-[var(--flux-primary)] !text-[var(--flux-primary-light)]" : ""}`}
            onClick={onClickStatusTab}
          >
            Status {dailyGenerating ? "• em andamento" : ""}
          </button>
        </div>

        {dailyTab === "entrada" ? (
          <div className="flex-1 min-h-0 overflow-auto">
            <p className="text-xs text-[var(--flux-text-muted)] mb-3">
              Cole a transcrição da daily (ou anexe arquivo .txt/.md) para gerar uma visão prática dos próximos passos.
            </p>
            {dailyGenerating && (
              <div className="mb-3 rounded-[10px] border border-[rgba(108,92,231,0.35)] bg-[rgba(108,92,231,0.12)] px-3 py-2">
                <p className="text-xs text-[var(--flux-primary-light)] font-semibold">
                  Geracao em andamento. Acompanhe pela guia Status.
                </p>
                <p className="text-[11px] text-[var(--flux-text-muted)] mt-1">
                  Voce pode fechar e reabrir este modal sem perder o progresso atual.
                </p>
              </div>
            )}
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <label className="btn-bar cursor-pointer">
                Anexar transcrição
                <input type="file" accept=".txt,.md,.log,.csv" className="hidden" onChange={onLoadDailyTranscriptFile} />
              </label>
              <button type="button" className="btn-secondary" onClick={onClearDailyAttachmentAndTranscript}>
                Excluir anexo e conteúdo
              </button>
              <span className="text-xs text-[var(--flux-text-muted)]">{dailyFileName}</span>
            </div>
            <textarea
              value={dailyTranscript}
              onChange={(e) => onDailyTranscriptChange(e.target.value)}
              placeholder="Ex: ontem finalizamos... hoje vamos... bloqueio em..."
              className="w-full min-h-[260px] p-3 rounded-[10px] border border-[rgba(255,255,255,0.12)] bg-[var(--flux-surface-mid)] text-[var(--flux-text)] text-sm outline-none focus:border-[var(--flux-primary)]"
            />
            <div className="flex items-center gap-2 justify-end mt-3">
              <button type="button" className="btn-secondary" onClick={onClose}>
                Fechar
              </button>
              <button type="button" className="btn-primary" onClick={onGenerateDailyInsight} disabled={dailyGenerating}>
                {dailyGenerating ? "Analisando e gerando com IA..." : "Gerar resumo prático"}
              </button>
            </div>
          </div>
        ) : dailyTab === "status" ? (
          <div className="flex-1 min-h-0 overflow-auto">
            <div className="mb-3 rounded-[10px] border border-[rgba(108,92,231,0.28)] bg-[var(--flux-surface-mid)] p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="text-xs font-semibold text-[var(--flux-primary-light)]">
                  Acompanhamento da geração
                </div>
                <div className="text-[11px] text-[var(--flux-text-muted)]">
                  {dailyGenerating
                    ? "Processando..."
                    : dailyStatusPhase === "done"
                      ? "Concluído"
                      : dailyStatusPhase === "error"
                        ? "Falha"
                        : dailyStatusPhase === "idle"
                          ? "Pronto"
                          : "Aguardando"}
                </div>
              </div>
              <div className="h-2 rounded-full bg-[rgba(255,255,255,0.08)] overflow-hidden">
                <div
                  className="h-full bg-[linear-gradient(90deg,var(--flux-primary),var(--flux-secondary))] transition-all duration-700 ease-out"
                  style={{
                    width: `${dailyStatusPhase === "idle" ? 0 : Math.max(6, Math.min(100, statusStepIndex * 25))}%`,
                    opacity: dailyGenerating ? 0.95 : 0.8,
                  }}
                />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 mt-2">
                {["Preparando", "Enviando", "Processando", "Concluído"].map((step, idx) => {
                  const stepPos = idx + 1;
                  const active = statusStepIndex >= stepPos;
                  return (
                    <div
                      key={step}
                      className={`text-[10px] rounded-[6px] px-2 py-1 border ${
                        active
                          ? "border-[rgba(108,92,231,0.45)] text-[var(--flux-primary-light)] bg-[rgba(108,92,231,0.12)]"
                          : "border-[rgba(255,255,255,0.1)] text-[var(--flux-text-muted)]"
                      }`}
                    >
                      {step}
                    </div>
                  );
                })}
              </div>
            </div>

            {dailyGenerating ? (
              dailyLogs.length > 0 ? (
                <div className="mt-4 bg-[var(--flux-surface-mid)] border border-[rgba(108,92,231,0.35)] rounded-[10px] p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="text-[11px] uppercase tracking-wide font-bold text-[var(--flux-primary-light)]">
                      Log de conectividade com IA
                    </div>
                    <button
                      type="button"
                      className="text-[10px] text-[var(--flux-text-muted)] hover:text-[var(--flux-primary-light)] underline-offset-2 hover:underline"
                      onClick={onClearDailyLogs}
                    >
                      Limpar log
                    </button>
                  </div>
                  <div className="max-h-40 overflow-auto space-y-1 scrollbar-flux">
                    {dailyLogs.map((log, index) => {
                      const dt = new Date(log.timestamp).toLocaleTimeString("pt-BR");
                      const baseClass =
                        log.status === "success"
                          ? "text-[var(--flux-primary-light)]"
                          : log.status === "error"
                            ? "text-[#F97373]"
                            : "text-[var(--flux-text-muted)]";
                      return (
                        <div key={`${log.timestamp}-${index}`} className="text-[11px] flex items-start gap-2">
                          <span className="text-[10px] text-[var(--flux-text-muted)] min-w-[54px]">{dt}</span>
                          <div className={`flex-1 ${baseClass} space-y-0.5`}>
                            <div>{log.message}</div>
                            {(log.provider || log.model) && (
                              <div className="text-[10px] text-[var(--flux-text-muted)]">
                                {log.provider && <span>LLM: {log.provider}</span>}
                                {log.provider && log.model && <span> • </span>}
                                {log.model && <span>Modelo: {log.model}</span>}
                              </div>
                            )}
                            {log.errorKind && (
                              <div className="text-[10px] text-[var(--flux-text-muted)]">
                                Erro IA: {log.errorKind}
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
                  O log aparecerá aqui assim que a geração for iniciada.
                </p>
              )
            ) : (
              <div className="mt-4 bg-[var(--flux-surface-mid)] border border-[rgba(108,92,231,0.35)] rounded-[10px] p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="text-[11px] uppercase tracking-wide font-bold text-[var(--flux-primary-light)]">
                    Execucoes de status
                  </div>
                  <span className="text-[10px] text-[var(--flux-text-muted)]">Vinculado ao histórico</span>
                </div>
                {dailyInsights.length ? (
                  <div className="space-y-2">
                    {dailyInsights.slice(0, 8).map((entry, idx) => {
                      const insight = entry?.insight;
                      const entryId = String(entry?.id || "");
                      if (!entryId || !insight) return null;

                      const generatedWithAi = Boolean(entry?.generationMeta?.usedLlm);
                      const label = generatedWithAi ? "Concluído" : "Concluído (heurístico)";
                      const createdAt = entry?.createdAt ? new Date(entry.createdAt).toLocaleString("pt-BR") : "";
                      const resumo = String(insight?.resumo || "").trim();
                      const resumoShort = resumo.length > 120 ? `${resumo.slice(0, 120)}...` : resumo;

                      return (
                        <button
                          key={entryId || idx}
                          type="button"
                          className="w-full text-left p-2 rounded-[8px] border border-[rgba(255,255,255,0.08)] bg-[var(--flux-surface-card)] hover:border-[rgba(108,92,231,0.35)] hover:bg-[rgba(108,92,231,0.08)] transition-colors"
                          onClick={() => onOpenDailyHistoryFromStatusEntry(entryId)}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[11px] font-semibold text-[var(--flux-primary-light)]">{label}</span>
                                {generatedWithAi && (
                                  <span className="text-[9px] font-semibold px-1.5 py-[1px] rounded-full border border-[rgba(108,92,231,0.5)] text-[var(--flux-primary-light)]">
                                    IA
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-[var(--flux-text-muted)] mt-1 truncate">
                                {resumoShort || "Sem resumo"}
                              </div>
                            </div>
                            <div className="text-[10px] text-[var(--flux-text-muted)] whitespace-nowrap">{createdAt}</div>
                          </div>
                          <div className="mt-2 text-[10px] text-[var(--flux-text-muted)] underline underline-offset-2">
                            Abrir no histórico
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-[var(--flux-text-muted)]">Nenhuma execução registrada ainda.</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-auto space-y-3">
            {dailyInsights.length ? (
              <>
                <div className="bg-[var(--flux-surface-mid)] border border-[rgba(255,255,255,0.08)] rounded-[12px] p-3">
                  <div className="flex items-end gap-2 flex-wrap">
                    <div className="min-w-[160px]">
                      <label className="text-[11px] uppercase tracking-wide font-bold text-[var(--flux-primary-light)] block mb-1">
                        De
                      </label>
                      <input
                        type="date"
                        value={dailyHistoryDateFrom}
                        onChange={(e) => onSetDailyHistoryDateFrom(e.target.value)}
                        className="w-full px-2 py-1 rounded-[var(--flux-rad-sm)] border border-[rgba(255,255,255,0.12)] text-xs bg-[var(--flux-surface-card)] text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                      />
                    </div>
                    <div className="min-w-[160px]">
                      <label className="text-[11px] uppercase tracking-wide font-bold text-[var(--flux-primary-light)] block mb-1">
                        Até
                      </label>
                      <input
                        type="date"
                        value={dailyHistoryDateTo}
                        onChange={(e) => onSetDailyHistoryDateTo(e.target.value)}
                        className="w-full px-2 py-1 rounded-[var(--flux-rad-sm)] border border-[rgba(255,255,255,0.12)] text-xs bg-[var(--flux-surface-card)] text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                      />
                    </div>
                    <div className="flex-1 min-w-[220px]">
                      <label className="text-[11px] uppercase tracking-wide font-bold text-[var(--flux-primary-light)] block mb-1">
                        Busca textual
                      </label>
                      <input
                        type="text"
                        value={dailyHistorySearchQuery}
                        onChange={(e) => onSetDailyHistorySearchQuery(e.target.value)}
                        placeholder="Buscar em resumo, contexto e listas..."
                        className="w-full px-2 py-1 rounded-[var(--flux-rad-sm)] border border-[rgba(255,255,255,0.12)] text-xs bg-[var(--flux-surface-card)] text-[var(--flux-text)] placeholder-[var(--flux-text-muted)] outline-none focus:border-[var(--flux-primary)]"
                      />
                    </div>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={onClearDailyHistoryFilters}
                    >
                      Limpar filtros
                    </button>
                  </div>
                  <p className="text-[11px] text-[var(--flux-text-muted)] mt-2">
                    Exibindo {filteredDailyInsights.length} de {dailyInsights.length} resumo(s).
                  </p>
                </div>

                {filteredDailyInsights.length > 0 && (
                  <div className="mt-3 bg-[var(--flux-surface-card)] border border-[rgba(255,255,255,0.08)] rounded-[10px] p-2">
                    <div className="text-[11px] uppercase tracking-wide font-bold text-[var(--flux-primary-light)] mb-1">
                      Lista de históricos
                    </div>
                    <div className="max-h-40 overflow-auto scrollbar-flux divide-y divide-[rgba(255,255,255,0.06)]">
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
                                ? "bg-[rgba(108,92,231,0.16)]"
                                : "hover:bg-[rgba(108,92,231,0.08)]"
                            }`}
                          >
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <span className="text-[11px] font-semibold text-[var(--flux-text)] truncate">
                                {insight.resumo || "Resumo sem título"}
                              </span>
                              <span className="text-[10px] text-[var(--flux-text-muted)]">
                                {dt || "Sem data"} • {createItems.length} item(ns) em "Criar"
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {generatedWithAi && (
                                <span className="text-[9px] font-semibold px-1.5 py-[1px] rounded-full border border-[rgba(108,92,231,0.5)] text-[var(--flux-primary-light)]">
                                  IA
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
                  const title = idx === 0 ? "Resumo mais recente" : `Histórico #${filteredDailyInsights.length - idx}`;
                  const createItems = getDailyCreateSuggestions(entry);
                  const entryId = String(entry.id || "");
                  const isExpanded = activeDailyHistoryId === entryId;
                  const sourceName = String(entry.sourceFileName || "Transcrição manual");
                  const generatedWithAi = Boolean(entry?.generationMeta?.usedLlm);
                  const aiModel = String(entry?.generationMeta?.model || "").trim();

                  return (
                    <div
                      key={entry.id || idx}
                      className={`bg-[var(--flux-surface-mid)] border rounded-[12px] p-3 transition-colors ${
                        isExpanded ? "border-[rgba(108,92,231,0.35)]" : "border-[rgba(255,255,255,0.08)]"
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
                          <span className="w-2 h-2 rounded-full bg-[var(--flux-primary)] shadow-[0_0_10px_rgba(108,92,231,0.6)]" />
                          <h4 className="font-display font-bold text-sm text-[var(--flux-text)]">
                            {title}
                            {dt ? ` • ${dt}` : ""}
                          </h4>
                          <span className="text-[10px] text-[var(--flux-text-muted)]">
                            {isExpanded ? "▲ Aberto" : "▼ Expandir"}
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
                            Colapsar
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
                              Baixar contexto
                            </button>
                            <button type="button" className="btn-bar" onClick={() => onCopyDailyContextDoc(entry)}>
                              Copiar contexto
                            </button>
                            <button type="button" className="btn-bar" onClick={() => onCreateCardsFromInsight(entry.id)}>
                              Criar cards do "Criar"
                            </button>
                            <button
                              type="button"
                              className="btn-danger-solid"
                              onClick={() => onDeleteDailyHistoryEntry(String(entry.id || ""))}
                            >
                              Excluir resumo
                            </button>
                          </div>
                          <p className="text-[11px] text-[var(--flux-text-muted)] mt-2">
                            Fonte: {sourceName}
                            {entry.transcript ? ` • ${entry.transcript.length} caracteres processados` : ""}
                          </p>

                          {generatedWithAi && (
                            <CustomTooltip content="Conteudo reescrito e estruturado por IA a partir da transcricao.">
                              <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-[rgba(108,92,231,0.35)] bg-[rgba(108,92,231,0.14)] px-2 py-1">
                                <span className="h-1.5 w-1.5 rounded-full bg-[var(--flux-primary)] shadow-[0_0_8px_rgba(108,92,231,0.6)]" />
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--flux-primary-light)]">
                                  Texto gerado com IA{aiModel ? ` • ${aiModel}` : ""}
                                </span>
                              </div>
                            </CustomTooltip>
                          )}

                          <p className="text-xs text-[var(--flux-text-muted)] mt-2">{insight.resumo || ""}</p>

                          <div className="mt-2 mb-2 bg-[var(--flux-surface-card)] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-2">
                            <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                              <div className="text-[11px] uppercase tracking-wide font-bold text-[var(--flux-primary-light)]">
                                Contexto organizado
                              </div>
                              {generatedWithAi && (
                                <div className="text-[10px] font-semibold text-[var(--flux-primary-light)]/90">
                                  Organizado por IA
                                </div>
                              )}
                            </div>
                            {renderOrganizedContext(String(insight.contextoOrganizado || ""))}
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {[
                              { key: "criar", label: "Criar", values: createItems },
                              { key: "ajustar", label: "Ajustar", values: getDailyActionSuggestions(insight.ajustar) },
                              { key: "corrigir", label: "Corrigir", values: getDailyActionSuggestions(insight.corrigir) },
                              { key: "pendencias", label: "Pendências", values: getDailyActionSuggestions(insight.pendencias) },
                            ].map((list) => (
                              <div
                                key={list.key}
                                className="bg-[var(--flux-surface-card)] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-2"
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
                                          ? "bg-[rgba(255,107,107,0.12)] text-[#EF4444] border-[rgba(255,107,107,0.3)]"
                                          : prioSlug === "importante"
                                            ? "bg-[rgba(255,217,61,0.12)] text-[#F59E0B] border-[rgba(255,217,61,0.3)]"
                                            : "bg-[rgba(116,185,255,0.12)] text-[#74B9FF] border-[rgba(116,185,255,0.3)]";
                                      const progClass =
                                        progSlug === "em-andamento"
                                          ? "bg-[rgba(0,201,183,0.12)] text-[#009E90] border-[rgba(0,201,183,0.35)]"
                                          : progSlug === "concluida"
                                            ? "bg-[rgba(16,185,129,0.12)] text-[#00E676] border-[rgba(16,185,129,0.35)]"
                                            : "bg-[var(--flux-surface-mid)] text-[var(--flux-text-muted)] border-[rgba(255,255,255,0.12)]";

                                      return (
                                        <li key={`${list.key}-${i}`}>
                                          <div className="rounded-[8px] border border-[rgba(255,255,255,0.08)] bg-[var(--flux-surface-mid)] p-2">
                                            <div className="flex items-start justify-between gap-2">
                                              <span className="flex-1 min-w-0 text-xs font-semibold text-[var(--flux-text)] leading-[1.35]">
                                                {String(item.titulo || "")}
                                              </span>
                                              <span className="flex gap-1 flex-wrap justify-end">
                                                <span
                                                  className={`text-[9px] font-bold px-1.5 py-[1px] rounded-full border whitespace-nowrap ${prioClass}`}
                                                >
                                                  Prio: {item.prioridade}
                                                </span>
                                                <span
                                                  className={`text-[9px] font-bold px-1.5 py-[1px] rounded-full border whitespace-nowrap ${progClass}`}
                                                >
                                                  Progresso: {item.progresso}
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
                                                <span className="text-[9px] font-semibold px-1.5 py-[1px] rounded-full border border-[rgba(255,255,255,0.14)] text-[var(--flux-text-muted)]">
                                                  Coluna: {item.coluna}
                                                </span>
                                              )}
                                              {item.dataConclusao && (
                                                <span className="text-[9px] font-semibold px-1.5 py-[1px] rounded-full border border-[rgba(255,255,255,0.14)] text-[var(--flux-text-muted)]">
                                                  Prazo: {item.dataConclusao}
                                                </span>
                                              )}
                                              {item.tags?.map((tag) => (
                                                <span
                                                  key={`${item.titulo}-${tag}`}
                                                  className="text-[9px] font-semibold px-1.5 py-[1px] rounded-full border border-[rgba(108,92,231,0.35)] text-[var(--flux-primary-light)]"
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
                                  <p className="text-xs text-[var(--flux-text-muted)]">Sem itens identificados.</p>
                                )}
                              </div>
                            ))}
                          </div>

                          <div className="mt-3 bg-[var(--flux-surface-card)] border border-[rgba(255,255,255,0.08)] rounded-[8px] p-2">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="text-[11px] uppercase tracking-wide font-bold text-[var(--flux-primary-light)]">
                                Cards criados a partir desta transcrição
                              </div>
                              <button
                                type="button"
                                className="btn-bar"
                                onClick={() => onExpandDailyHistoryCreatedCards(String(entry.id || ""))}
                              >
                                {activeCreatedCardsExpandedId === String(entry.id || "")
                                  ? "Detalhes abertos"
                                  : "Ver todas as informações"}
                              </button>
                            </div>
                            <p className="text-xs text-[var(--flux-text-muted)] mt-1">
                              {Array.isArray(entry.createdCards) ? entry.createdCards.length : 0} card(s) registrados.
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
                                      className="border border-[rgba(255,255,255,0.08)] rounded-[8px] p-2 bg-[var(--flux-surface-mid)]"
                                    >
                                      <div className="text-xs font-semibold text-[var(--flux-text)]">
                                        {createdCard.title || "Sem título"}
                                        {createdCard.status === "existing" && (
                                          <span className="ml-2 text-[10px] font-bold px-1.5 py-[1px] rounded-full border border-[rgba(255,217,61,0.3)] text-[#F59E0B] bg-[rgba(255,217,61,0.12)]">
                                            Card ja existente
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[11px] text-[var(--flux-text-muted)] mt-1">
                                        ID: {createdCard.cardId} • Coluna: {createdCard.bucket} • Prioridade: {createdCard.priority} •
                                        Progresso: {createdCard.progress}
                                      </div>
                                      <div className="text-[11px] text-[var(--flux-text-muted)] mt-1">
                                        Direcionamento: {createdCard.direction || "-"} • Data:{" "}
                                        {createdCard.createdAt
                                          ? new Date(createdCard.createdAt).toLocaleString("pt-BR")
                                          : "-"}
                                      </div>
                                      <div className="text-[11px] text-[var(--flux-text-muted)] mt-1">
                                        Tags:{" "}
                                        {Array.isArray(createdCard.tags) && createdCard.tags.length
                                          ? createdCard.tags.join(", ")
                                          : "-"}
                                      </div>
                                      <p className="text-xs text-[var(--flux-text)] mt-1 whitespace-pre-line">
                                        {createdCard.desc || "Sem descrição."}
                                      </p>
                                    </div>
                                  ))
                                ) : (
                                  <p className="text-xs text-[var(--flux-text-muted)]">
                                    Nenhum card criado para este resumo até o momento.
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
                    Nenhum resumo encontrado com os filtros informados.
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-[var(--flux-text-muted)]">Ainda não existe resumo salvo para este board.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

