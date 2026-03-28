"use client";

import { useLocale, useTranslations } from "next-intl";
import type { SpecPlanRunLogEntry } from "@/lib/spec-plan-run-types";
import { SpecPlanProgressStepper } from "@/components/spec-plan/spec-plan-progress-stepper";

type PhaseState = "pending" | "running" | "done" | "error";

export function SpecPlanAnalysisDrawer(props: {
  open: boolean;
  onClose: () => void;
  analyzing: boolean;
  phases: { key: string; label: string; state: PhaseState }[];
  friendlyHints: Record<string, string>;
  docMeta: null | {
    fileName: string;
    kind: string;
    charCount?: number;
    pageCount?: number;
    warnings: string[];
  };
  logs: SpecPlanRunLogEntry[];
  onClearLogs: () => void;
  streamError: string | null;
  errorDetail: string | null;
}) {
  const t = useTranslations("specPlanPage.analysisModal");
  const tPage = useTranslations("specPlanPage");
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
          Math.round(((doneCount + (runningIdx >= 0 ? 0.45 : 0)) / props.phases.length) * 100)
        );

  const expandedKey =
    props.phases.find((p) => p.state === "running")?.key ??
    props.phases.find((p) => p.state === "error")?.key ??
    null;

  return (
    <>
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        className="fixed inset-0 z-[calc(var(--flux-z-card-ai-overlay)-1)] bg-[var(--flux-backdrop-scrim)] backdrop-blur-sm"
        onClick={props.onClose}
      />
      <aside
        className="fixed inset-y-0 right-0 z-[var(--flux-z-card-ai-overlay)] flex w-full max-w-md flex-col border-l border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-card)] shadow-2xl md:max-w-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="spec-plan-drawer-title"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--flux-primary-alpha-12)] p-4">
          <div>
            <h3 id="spec-plan-drawer-title" className="font-display text-base font-bold text-[var(--flux-text)]">
              {t("title")}
            </h3>
            <p className="text-xs text-[var(--flux-text-muted)]">{t("subtitle")}</p>
          </div>
          <button type="button" onClick={props.onClose} className="btn-secondary shrink-0">
            {t("close")}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-flux p-4">
          <div className="rounded-[10px] border border-[var(--flux-primary-alpha-28)] bg-[var(--flux-surface-mid)] p-3">
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
          </div>

          <div className="mt-4 rounded-[10px] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-black-alpha-04)] p-3">
            <SpecPlanProgressStepper
              phases={props.phases}
              friendlyHints={props.friendlyHints}
              statusDone={tPage("statusDone")}
              statusRunning={tPage("statusRunning")}
              statusError={tPage("statusError")}
              statusPending={tPage("statusPending")}
              expandedKey={expandedKey}
            />
          </div>

          {props.docMeta ? (
            <div className="mt-4 rounded-[10px] border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-chrome-alpha-04)] p-3 text-[11px] text-[var(--flux-text-muted)]">
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
            <div className="mt-4 rounded-[10px] border border-[var(--flux-danger)]/35 bg-[var(--flux-danger)]/10 p-3">
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

          <details className="mt-4 rounded-[10px] border border-[var(--flux-primary-alpha-35)] bg-[var(--flux-surface-mid)] p-3 open:border-[var(--flux-primary-alpha-45)]">
            <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-wide text-[var(--flux-primary-light)]">
              {tPage("technicalLogTitle")}
            </summary>
            <div className="mt-3">
              <div className="mb-2 flex items-center justify-end">
                <button
                  type="button"
                  className="text-[10px] text-[var(--flux-text-muted)] underline-offset-2 hover:text-[var(--flux-primary-light)] hover:underline"
                  onClick={(e) => {
                    e.preventDefault();
                    props.onClearLogs();
                  }}
                >
                  {t("logClear")}
                </button>
              </div>
              {props.logs.length === 0 ? (
                <p className="text-xs text-[var(--flux-text-muted)]">{t("logEmpty")}</p>
              ) : (
                <div className="max-h-56 space-y-1 overflow-auto scrollbar-flux">
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
                            <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words rounded border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-black-alpha-04)] p-1.5 text-[10px] text-[var(--flux-text-muted)] scrollbar-flux">
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
          </details>
        </div>
      </aside>
    </>
  );
}
