"use client";

import { useLocale, useTranslations } from "next-intl";

export type SpecPlanAnalysisLogLevel = "info" | "success" | "error";

export type SpecPlanAnalysisLogEntry = {
  id: string;
  timestamp: number;
  level: SpecPlanAnalysisLogLevel;
  message: string;
  detail?: string;
};

type PhaseState = "pending" | "running" | "done" | "error";

export function SpecPlanAnalysisModal(props: {
  open: boolean;
  onClose: () => void;
  analyzing: boolean;
  phases: { key: string; label: string; state: PhaseState }[];
  docMeta: null | {
    fileName: string;
    kind: string;
    charCount?: number;
    pageCount?: number;
    warnings: string[];
  };
  logs: SpecPlanAnalysisLogEntry[];
  onClearLogs: () => void;
  streamError: string | null;
  errorDetail: string | null;
}) {
  const t = useTranslations("specPlanPage.analysisModal");
  const locale = useLocale();

  if (!props.open) return null;

  const doneCount = props.phases.filter((p) => p.state === "done").length;
  const runningIdx = props.phases.findIndex((p) => p.state === "running");
  const hasError = props.phases.some((p) => p.state === "error");
  const progressPct =
    props.phases.length === 0
      ? 0
      : Math.min(
          100,
          Math.round(
            ((doneCount + (runningIdx >= 0 ? 0.45 : 0)) / props.phases.length) * 100
          )
        );

  return (
    <div
      className="fixed inset-0 z-[var(--flux-z-card-ai-overlay)] flex items-center justify-center bg-[var(--flux-backdrop-scrim)] p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="spec-plan-analysis-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div
        className="max-h-[min(90vh,720px)] w-full max-w-2xl overflow-hidden rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-card)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3
              id="spec-plan-analysis-title"
              className="font-display text-base font-bold text-[var(--flux-text)]"
            >
              {t("title")}
            </h3>
            <p className="text-xs text-[var(--flux-text-muted)]">{t("subtitle")}</p>
          </div>
          <button type="button" onClick={props.onClose} className="btn-secondary shrink-0">
            {t("close")}
          </button>
        </div>

        <div className="mb-3 rounded-[10px] border border-[var(--flux-primary-alpha-28)] bg-[var(--flux-surface-mid)] p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-xs font-semibold text-[var(--flux-primary-light)]">{t("trackingTitle")}</div>
            <div className="text-[11px] text-[var(--flux-text-muted)]">
              {props.analyzing
                ? t("status.busy")
                : hasError
                  ? t("status.error")
                  : doneCount === props.phases.length && props.phases.length > 0
                    ? t("status.done")
                    : t("status.idle")}
            </div>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--flux-chrome-alpha-08)]">
            <div
              className="h-full bg-[linear-gradient(90deg,var(--flux-primary),var(--flux-secondary))] transition-all duration-500 ease-out"
              style={{
                width: `${Math.max(4, progressPct)}%`,
                opacity: props.analyzing ? 0.95 : 0.85,
              }}
            />
          </div>
          <div className="mt-2 grid max-h-40 grid-cols-2 gap-1.5 overflow-y-auto sm:grid-cols-3 scrollbar-flux md:grid-cols-4">
            {props.phases.map((p) => {
              const active = p.state === "running" || p.state === "done" || p.state === "error";
              const err = p.state === "error";
              return (
                <div
                  key={p.key}
                  className={`rounded-[6px] border px-2 py-1 text-[10px] ${
                    err
                      ? "border-[var(--flux-danger)]/50 bg-[var(--flux-danger)]/10 text-[var(--flux-danger-bright)]"
                      : active
                        ? "border-[var(--flux-primary-alpha-45)] bg-[var(--flux-primary-alpha-12)] text-[var(--flux-primary-light)]"
                        : "border-[var(--flux-chrome-alpha-10)] text-[var(--flux-text-muted)]"
                  }`}
                >
                  {p.label}
                </div>
              );
            })}
          </div>
        </div>

        {props.docMeta ? (
          <div className="mb-3 rounded-[10px] border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-chrome-alpha-04)] p-3 text-[11px] text-[var(--flux-text-muted)]">
            <div className="font-semibold text-[var(--flux-text)]">{t("docReadTitle")}</div>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              <li>
                {t("docFileName")}: <span className="text-[var(--flux-text)]">{props.docMeta.fileName}</span>
              </li>
              <li>
                {t("docKind")}: {props.docMeta.kind}
              </li>
              {typeof props.docMeta.charCount === "number" ? (
                <li>
                  {t("docCharCount")}: {props.docMeta.charCount.toLocaleString(locale)}
                </li>
              ) : null}
              {typeof props.docMeta.pageCount === "number" ? (
                <li>
                  {t("docPageCount")}: {props.docMeta.pageCount}
                </li>
              ) : null}
            </ul>
            {props.docMeta.warnings.length > 0 ? (
              <div className="mt-2 text-[10px] text-[var(--flux-amber)]">
                {t("docWarnings")}: {props.docMeta.warnings.join(" · ")}
              </div>
            ) : null}
          </div>
        ) : null}

        {(props.streamError || props.errorDetail) && (
          <div className="mb-3 rounded-[10px] border border-[var(--flux-danger)]/35 bg-[var(--flux-danger)]/10 p-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--flux-danger-bright)]">
              {t("errorBlockTitle")}
            </div>
            {props.streamError ? (
              <p className="mt-1 text-sm text-[var(--flux-text)]">{props.streamError}</p>
            ) : null}
            {props.errorDetail ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-semibold text-[var(--flux-primary-light)]">
                  {t("errorDetailToggle")}
                </summary>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-dark)] p-2 text-[10px] text-[var(--flux-text-muted)] scrollbar-flux">
                  {props.errorDetail}
                </pre>
              </details>
            ) : null}
          </div>
        )}

        <div className="rounded-[10px] border border-[var(--flux-primary-alpha-35)] bg-[var(--flux-surface-mid)] p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--flux-primary-light)]">
              {t("logTitle")}
            </div>
            <button
              type="button"
              className="text-[10px] text-[var(--flux-text-muted)] underline-offset-2 hover:text-[var(--flux-primary-light)] hover:underline"
              onClick={props.onClearLogs}
            >
              {t("logClear")}
            </button>
          </div>
          {props.logs.length === 0 ? (
            <p className="text-xs text-[var(--flux-text-muted)]">{t("logEmpty")}</p>
          ) : (
            <div className="max-h-52 space-y-1 overflow-auto scrollbar-flux">
              {props.logs.map((log) => {
                const dt = new Date(log.timestamp).toLocaleTimeString(locale, {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                });
                const color =
                  log.level === "success"
                    ? "text-[var(--flux-primary-light)]"
                    : log.level === "error"
                      ? "text-[var(--flux-danger-bright)]"
                      : "text-[var(--flux-text-muted)]";
                return (
                  <div key={log.id} className="flex items-start gap-2 text-[11px]">
                    <span className="min-w-[64px] text-[10px] text-[var(--flux-text-muted)]">{dt}</span>
                    <div className={`min-w-0 flex-1 space-y-1 ${color}`}>
                      <div>{log.message}</div>
                      {log.detail ? (
                        <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words rounded border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-black-alpha-04)] p-1.5 text-[10px] text-[var(--flux-text-muted)] scrollbar-flux">
                          {log.detail}
                        </pre>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
