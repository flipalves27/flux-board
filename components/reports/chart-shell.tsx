"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { apiPost, ApiError } from "@/lib/api-client";
import { AiModelHint } from "@/components/ai-model-hint";

export function ChartShell({
  title,
  hint,
  children,
  chartId,
  explainPayload,
  explainApiPath = "/api/flux-reports/explain",
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  chartId: string;
  explainPayload: unknown;
  /** Ex.: `/api/flux-reports/lss/explain` para relatório Lean Six Sigma. */
  explainApiPath?: string;
}) {
  const t = useTranslations("reports");
  const { getHeaders } = useAuth();
  const [busy, setBusy] = useState(false);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [explainModel, setExplainModel] = useState<string | null>(null);
  const [explainProvider, setExplainProvider] = useState<string | null>(null);

  const explain = useCallback(async () => {
    setBusy(true);
    setErr(null);
    setExplainModel(null);
    setExplainProvider(null);
    try {
      const data = await apiPost<{
        narrative: string;
        generatedWithAI?: boolean;
        errorMessage?: string;
        model?: string;
        provider?: string;
      }>(
        explainApiPath,
        {
          chartId,
          chartTitle: title,
          dataSummary: JSON.stringify(explainPayload),
        },
        getHeaders()
      );
      setNarrative(data.narrative);
      setExplainModel(typeof data.model === "string" ? data.model : null);
      setExplainProvider(typeof data.provider === "string" ? data.provider : null);
    } catch (e) {
      if (e instanceof ApiError) {
        setErr(e.message);
      } else {
        setErr(t("explainError"));
      }
    } finally {
      setBusy(false);
    }
  }, [chartId, explainApiPath, explainPayload, getHeaders, title, t]);

  return (
    <section className="rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-card)] p-4 sm:p-5">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="font-display text-sm font-bold text-[var(--flux-text)]">{title}</h3>
          {hint ? <p className="mt-1 text-[11px] leading-relaxed text-[var(--flux-text-muted)]">{hint}</p> : null}
        </div>
        <button
          type="button"
          onClick={explain}
          disabled={busy}
          className="shrink-0 rounded-[var(--flux-rad-sm)] border border-[var(--flux-primary-alpha-40)] bg-[var(--flux-primary-alpha-15)] px-3 py-1.5 text-xs font-semibold text-[var(--flux-primary-light)] transition-colors hover:border-[var(--flux-primary)] disabled:opacity-50"
        >
          {busy ? t("explaining") : t("explain")}
        </button>
      </div>
      {children}
      {err ? <p className="mt-3 text-xs text-[var(--flux-danger)]">{err}</p> : null}
      {narrative ? (
        <div className="mt-3 rounded-[var(--flux-rad-sm)] border border-[var(--flux-secondary-alpha-25)] bg-[var(--flux-secondary-alpha-06)] px-3 py-2.5 text-sm leading-relaxed text-[var(--flux-text)]">
          {narrative}
          {(explainModel || explainProvider) && (
            <div className="mt-2 pt-2 border-t border-[var(--flux-chrome-alpha-08)]">
              <AiModelHint model={explainModel ?? undefined} provider={explainProvider ?? undefined} />
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
