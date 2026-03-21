"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { AiModelHint } from "@/components/ai-model-hint";

type AnomalyInsightsPayload = {
  schema: string;
  mongo: boolean;
  runs: Array<{ id: string; runAt: string; alertCount: number; alerts: unknown[] }>;
  alerts: Array<{
    id: string;
    kind: string;
    severity: string;
    title: string;
    message: string;
    diagnostics: Record<string, unknown>;
    boardId?: string;
    boardName?: string;
    read: boolean;
    createdAt: string;
    suggestedAction?: string;
    suggestedActionModel?: string;
    suggestedActionProvider?: string;
  }>;
  unreadCount: number;
  health: { status: "healthy" | "attention" | "no_data"; lastRunAt: string | null };
};

function healthStyles(status: AnomalyInsightsPayload["health"]["status"]): string {
  if (status === "healthy")
    return "border-[var(--flux-success-alpha-40)] bg-[var(--flux-success-alpha-10)] text-[var(--flux-secondary-light)]";
  if (status === "attention")
    return "border-[var(--flux-amber-alpha-45)] bg-[var(--flux-amber-alpha-12)] text-[var(--flux-warning)]";
  return "border-[var(--flux-chrome-alpha-15)] bg-[var(--flux-chrome-alpha-04)] text-[var(--flux-text-muted)]";
}

function severityDot(sev: string): string {
  if (sev === "critical") return "bg-[var(--flux-danger)]";
  if (sev === "warning") return "bg-[var(--flux-warning)]";
  return "bg-[var(--flux-primary-light)]";
}

export function ProactiveAiPanel() {
  const t = useTranslations("reports.proactive");
  const { getHeaders } = useAuth();
  const [data, setData] = useState<AnomalyInsightsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [markBusy, setMarkBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<AnomalyInsightsPayload>("/api/anomaly-insights", getHeaders());
      setData(res);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
      } else {
        setError(t("loadError"));
      }
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [getHeaders, t]);

  useEffect(() => {
    load();
  }, [load]);

  const fmtTime = useMemo(() => {
    return (iso: string) => {
      try {
        return new Intl.DateTimeFormat(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(iso));
      } catch {
        return iso;
      }
    };
  }, []);

  const markAllRead = async () => {
    setMarkBusy(true);
    try {
      await apiPost("/api/anomaly-alerts/read", { markAll: true }, getHeaders());
      await load();
    } catch {
      /* noop */
    } finally {
      setMarkBusy(false);
    }
  };

  if (loading) {
    return (
      <section className="rounded-[var(--flux-rad)] border border-[var(--flux-secondary-alpha-22)] bg-[var(--flux-surface-card)] p-5">
        <p className="text-sm text-[var(--flux-text-muted)]">{t("loading")}</p>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="rounded-[var(--flux-rad)] border border-[var(--flux-danger-alpha-30)] bg-[var(--flux-danger-alpha-06)] px-4 py-3 text-sm text-[var(--flux-text)]">
        {error ?? t("empty")}
      </section>
    );
  }

  if (!data.mongo) {
    return (
      <section className="rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-card)] p-5">
        <h3 className="font-display text-sm font-bold text-[var(--flux-text)]">{t("title")}</h3>
        <p className="mt-2 text-sm text-[var(--flux-text-muted)]">{t("noMongo")}</p>
      </section>
    );
  }

  const health = data.health.status;

  return (
    <section className="rounded-[var(--flux-rad)] border border-[var(--flux-secondary-alpha-28)] bg-gradient-to-br from-[var(--flux-secondary-alpha-07)] to-[var(--flux-primary-alpha-06)] p-5 shadow-[var(--flux-shadow-inset-hairline)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--flux-primary-light)] opacity-40" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--flux-primary-light)]" />
            </span>
            <h3 className="font-display text-sm font-bold tracking-tight text-[var(--flux-text)]">{t("title")}</h3>
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${healthStyles(health)}`}
            >
              {health === "healthy" ? t("health.ok") : health === "attention" ? t("health.review") : t("health.idle")}
            </span>
            {data.unreadCount > 0 ? (
              <span className="rounded-full bg-[var(--flux-primary-alpha-35)] px-2 py-0.5 text-[10px] font-bold text-[var(--flux-text-on-primary)]">
                {data.unreadCount} {t("unread")}
              </span>
            ) : null}
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--flux-text-muted)]">{t("subtitle")}</p>
          {data.health.lastRunAt ? (
            <p className="mt-2 text-xs text-[var(--flux-text-muted)]">
              {t("lastRun")}: <span className="text-[var(--flux-text)]">{fmtTime(data.health.lastRunAt)}</span>
            </p>
          ) : (
            <p className="mt-2 text-xs text-[var(--flux-warning)]">{t("neverRun")}</p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => load()}
            className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-15)] bg-[var(--flux-chrome-alpha-05)] px-3 py-1.5 text-xs font-semibold text-[var(--flux-text)] transition-colors hover:bg-[var(--flux-chrome-alpha-10)]"
          >
            {t("refresh")}
          </button>
          {data.unreadCount > 0 ? (
            <button
              type="button"
              disabled={markBusy}
              onClick={markAllRead}
              className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-primary-alpha-45)] bg-[var(--flux-primary-alpha-20)] px-3 py-1.5 text-xs font-semibold text-[var(--flux-primary-light)] transition-colors hover:border-[var(--flux-primary)] disabled:opacity-50"
            >
              {markBusy ? "…" : t("markAllRead")}
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div>
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">
            {t("runsTitle")}
          </h4>
          <ul className="mt-2 max-h-[220px] space-y-1.5 overflow-y-auto pr-1">
            {data.runs.length === 0 ? (
              <li className="text-sm text-[var(--flux-text-muted)]">{t("noRuns")}</li>
            ) : (
              data.runs.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-2 rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-black-alpha-15)] px-3 py-2 text-xs"
                >
                  <span className="text-[var(--flux-text)]">{fmtTime(r.runAt)}</span>
                  <span className="text-[var(--flux-text-muted)]">
                    {r.alertCount} {r.alertCount === 1 ? t("alertSingular") : t("alertPlural")}
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>
        <div>
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">
            {t("alertsTitle")}
          </h4>
          <ul className="mt-2 max-h-[280px] space-y-2 overflow-y-auto pr-1">
            {data.alerts.length === 0 ? (
              <li className="text-sm text-[var(--flux-text-muted)]">{t("noAlerts")}</li>
            ) : (
              data.alerts.map((a) => (
                <li
                  key={a.id}
                  className={`rounded-[var(--flux-rad-sm)] border px-3 py-2 text-xs ${
                    a.read ? "border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-black-alpha-10)] opacity-80" : "border-[var(--flux-primary-alpha-25)] bg-[var(--flux-black-alpha-20)]"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${severityDot(a.severity)}`} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[var(--flux-text)]">{a.title}</p>
                      <p className="mt-0.5 leading-relaxed text-[var(--flux-text-muted)]">{a.message}</p>
                      {a.suggestedAction ? (
                        <div className="mt-1.5 space-y-0.5 rounded-[var(--flux-rad-sm)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-primary-alpha-06)] px-2 py-1.5">
                          <p className="text-[11px] leading-relaxed text-[var(--flux-secondary-light)]">
                            <span className="font-semibold text-[var(--flux-text)]">{t("suggested")}: </span>
                            {a.suggestedAction}
                          </p>
                          {(a.suggestedActionModel || a.suggestedActionProvider) && (
                            <AiModelHint model={a.suggestedActionModel} provider={a.suggestedActionProvider} />
                          )}
                        </div>
                      ) : null}
                      {a.boardName ? (
                        <p className="mt-1 text-[10px] text-[var(--flux-text-muted)]">
                          {t("board")}: {a.boardName}
                        </p>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setExpanded((x) => (x === a.id ? null : a.id))}
                        className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--flux-primary-light)] hover:underline"
                      >
                        {expanded === a.id ? t("hideDiag") : t("showDiag")}
                      </button>
                      {expanded === a.id ? (
                        <pre className="mt-2 max-h-32 overflow-auto rounded border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-black-alpha-30)] p-2 text-[10px] leading-relaxed text-[var(--flux-secondary-light)]">
                          {JSON.stringify(a.diagnostics, null, 2)}
                        </pre>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>

      <p className="mt-4 border-t border-[var(--flux-chrome-alpha-10)] pt-3 text-[11px] leading-relaxed text-[var(--flux-text-muted)]">
        {t("cronHint")}
      </p>
    </section>
  );
}
