"use client";

import { useCardModal } from "@/components/kanban/card-modal-context";

export function CardModalAiOverlay() {
  const {
    boardName,
    aiContextOpen,
    setAiContextOpen,
    aiContextPhase,
    aiContextBusy,
    aiContextStatusStepIndex,
    aiContextLogs,
    setAiContextLogs,
    aiContextApplied,
    aiContextBusinessSummary,
    aiContextObjective,
    t,
  } = useCardModal();

  if (!aiContextOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[420] bg-[var(--flux-backdrop-scrim)] backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-context-title"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="w-full max-w-2xl bg-[var(--flux-surface-card)] border border-[var(--flux-primary-alpha-20)] rounded-[var(--flux-rad)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 id="ai-context-title" className="font-display font-bold text-[var(--flux-text)] text-base">
              {t("cardModal.aiContext.title")}
            </h3>
            <p className="text-xs text-[var(--flux-text-muted)]">
              {t("cardModal.aiContext.boardLabel", {
                boardName: boardName || t("cardModal.aiContext.boardFallback"),
              })}
            </p>
          </div>
          <button type="button" onClick={() => setAiContextOpen(false)} className="btn-secondary">
            {t("cardModal.aiContext.close")}
          </button>
        </div>

        <div className="mb-3 rounded-[10px] border border-[var(--flux-primary-alpha-28)] bg-[var(--flux-surface-mid)] p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-xs font-semibold text-[var(--flux-primary-light)]">
              {t("cardModal.aiContext.trackingTitle")}
            </div>
            <div className="text-[11px] text-[var(--flux-text-muted)]">
              {aiContextBusy
                ? t("cardModal.aiContext.status.busy")
                : aiContextPhase === "done"
                  ? t("cardModal.aiContext.status.done")
                  : aiContextPhase === "error"
                    ? t("cardModal.aiContext.status.error")
                    : t("cardModal.aiContext.status.idle")}
            </div>
          </div>
          <div className="h-2 rounded-full bg-[var(--flux-chrome-alpha-08)] overflow-hidden">
            <div
              className="h-full bg-[linear-gradient(90deg,var(--flux-primary),var(--flux-secondary))] transition-all duration-700 ease-out"
              style={{
                width: `${aiContextPhase === "idle" ? 0 : Math.max(6, Math.min(100, aiContextStatusStepIndex * 25))}%`,
                opacity: aiContextBusy ? 0.95 : 0.85,
              }}
            />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 mt-2">
            {[
              t("cardModal.aiContext.steps.preparing"),
              t("cardModal.aiContext.steps.sending"),
              t("cardModal.aiContext.steps.processing"),
              t("cardModal.aiContext.steps.done"),
            ].map((step, idx) => {
              const stepPos = idx + 1;
              const active = aiContextStatusStepIndex >= stepPos;
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
            })}
          </div>
        </div>

        {aiContextBusy ? (
          aiContextLogs.length > 0 ? (
            <div className="bg-[var(--flux-surface-mid)] border border-[var(--flux-primary-alpha-35)] rounded-[10px] p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="text-[11px] uppercase tracking-wide font-bold text-[var(--flux-primary-light)]">
                  {t("cardModal.aiContext.log.title")}
                </div>
                <button
                  type="button"
                  className="text-[10px] text-[var(--flux-text-muted)] hover:text-[var(--flux-primary-light)] underline-offset-2 hover:underline"
                  onClick={() => setAiContextLogs([])}
                >
                  {t("cardModal.aiContext.log.clearButton")}
                </button>
              </div>
              <div className="max-h-56 overflow-auto space-y-1 scrollbar-flux">
                {aiContextLogs.map((log, index) => {
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
                        {log.provider || log.model ? (
                          <div className="text-[10px] text-[var(--flux-text-muted)]">
                            {log.provider && (
                              <span>
                                {t("cardModal.aiContext.log.llmPrefix")} {log.provider}
                              </span>
                            )}
                            {log.provider && log.model ? <span> • </span> : null}
                            {log.model && (
                              <span>
                                {t("cardModal.aiContext.log.modelPrefix")} {log.model}
                              </span>
                            )}
                          </div>
                        ) : null}
                        {log.errorKind ? (
                          <div className="text-[10px] text-[var(--flux-text-muted)]">
                            {t("cardModal.aiContext.log.errorPrefix")} {log.errorKind}
                            {log.errorMessage ? ` - ${log.errorMessage}` : ""}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-xs text-[var(--flux-text-muted)] mt-4">{t("cardModal.aiContext.log.emptyMessage")}</p>
          )
        ) : (
          <div className="mt-4 bg-[var(--flux-surface-mid)] border border-[var(--flux-primary-alpha-35)] rounded-[10px] p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="text-[11px] uppercase tracking-wide font-bold text-[var(--flux-primary-light)]">
                {t("cardModal.aiContext.result.appliedHeader")}
              </div>
              <span className="text-[10px] text-[var(--flux-text-muted)]">
                {aiContextPhase === "done"
                  ? aiContextApplied?.usedLlm
                    ? t("cardModal.aiContext.result.applied.ai")
                    : t("cardModal.aiContext.result.applied.fallback")
                  : aiContextPhase === "error"
                    ? t("cardModal.aiContext.result.status.error")
                    : ""}
              </span>
            </div>

            {aiContextPhase === "done" && aiContextApplied ? (
              <div className="space-y-2">
                <div className="text-xs text-[var(--flux-text-muted)]">{t("cardModal.aiContext.result.autoFilledText")}</div>
                {(aiContextBusinessSummary || aiContextObjective) && (
                  <div className="rounded-[10px] border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-chrome-alpha-04)] p-3">
                    {aiContextBusinessSummary ? (
                      <div className="text-[11px] mb-2">
                        <span className="font-semibold text-[var(--flux-text)]">
                          {t("cardModal.aiContext.result.businessLabel")}
                        </span>{" "}
                        <span className="text-[var(--flux-text-muted)]">{aiContextBusinessSummary}</span>
                      </div>
                    ) : null}
                    {aiContextObjective ? (
                      <div className="text-[11px]">
                        <span className="font-semibold text-[var(--flux-text)]">
                          {t("cardModal.aiContext.result.objectiveLabel")}
                        </span>{" "}
                        <span className="text-[var(--flux-text-muted)]">{aiContextObjective}</span>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ) : aiContextPhase === "error" ? (
              <div className="text-xs text-[var(--flux-text-muted)]">{t("cardModal.logs.unableToGenerateContext")}</div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
