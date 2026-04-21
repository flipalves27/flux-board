"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { apiPost, ApiError } from "@/lib/api-client";
import { DataFadeIn } from "@/components/ui/data-fade-in";

type PortfolioBoardRow = {
  id: string;
  name: string;
  clientLabel: string | null;
  risco: number | null;
  throughput: number | null;
  previsibilidade: number | null;
  cardCount: number;
};

export type PortfolioAiPanelData = {
  portfolioBoards?: PortfolioBoardRow[];
};

function heatBg(risco: number | null): string {
  if (risco == null) return "bg-[var(--flux-chrome-alpha-08)]";
  if (risco >= 72) return "bg-[var(--flux-success)]/25";
  if (risco >= 48) return "bg-[var(--flux-warning)]/20";
  return "bg-[var(--flux-danger)]/22";
}

export function PortfolioAiPanel({ data }: { data: PortfolioAiPanelData }) {
  const t = useTranslations("executiveDashboard.portfolioAi");
  const { getHeaders } = useAuth();
  const boards = data.portfolioBoards ?? [];
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(async () => {
    const q = message.trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiPost<{ reply: string }>("/api/org/portfolio-ai", { message: q }, getHeaders());
      setReply(res.reply);
    } catch (e) {
      setReply(null);
      setError(e instanceof ApiError ? e.message : t("error"));
    } finally {
      setLoading(false);
    }
  }, [message, loading, getHeaders, t]);

  const chips = [t("chip1"), t("chip2"), t("chip3")];

  return (
    <section className="rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-22)] bg-[var(--flux-surface-card)] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-primary-light)]">
            {t("badge")}
          </p>
          <h3 className="font-display text-sm font-bold text-[var(--flux-text)]">{t("title")}</h3>
          <p className="mt-1 max-w-2xl text-[11px] text-[var(--flux-text-muted)]">{t("subtitle")}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="min-w-0">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">
            {t("heatmapTitle")}
          </p>
          {boards.length === 0 ? (
            <p className="text-xs text-[var(--flux-text-muted)]">{t("heatmapEmpty")}</p>
          ) : (
            <div className="overflow-x-auto rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-08)]">
              <table className="w-full min-w-[320px] text-left text-[11px]">
                <thead>
                  <tr className="border-b border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-dark)]">
                    <th className="px-2 py-2 font-semibold text-[var(--flux-text-muted)]">{t("colBoard")}</th>
                    <th className="px-2 py-2 font-semibold text-[var(--flux-text-muted)]">{t("colRisk")}</th>
                    <th className="px-2 py-2 font-semibold text-[var(--flux-text-muted)]">{t("colThroughput")}</th>
                    <th className="px-2 py-2 font-semibold text-[var(--flux-text-muted)]">{t("colPrev")}</th>
                  </tr>
                </thead>
                <tbody>
                  {boards.slice(0, 16).map((b: PortfolioBoardRow) => (
                    <tr key={b.id} className="border-b border-[var(--flux-chrome-alpha-06)]">
                      <td className="px-2 py-1.5 font-medium text-[var(--flux-text)]">
                        <span className="line-clamp-2">{b.name}</span>
                      </td>
                      <td className={`px-2 py-1.5 text-center font-mono tabular-nums ${heatBg(b.risco)}`}>
                        {b.risco ?? "—"}
                      </td>
                      <td className="px-2 py-1.5 text-center font-mono tabular-nums text-[var(--flux-text)]">
                        {b.throughput ?? "—"}
                      </td>
                      <td className="px-2 py-1.5 text-center font-mono tabular-nums text-[var(--flux-text)]">
                        {b.previsibilidade ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">
            {t("assistantTitle")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <button
                key={c}
                type="button"
                className="rounded-full border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-dark)] px-2.5 py-1 text-[10px] text-[var(--flux-text)] transition-colors hover:border-[var(--flux-primary-alpha-35)]"
                onClick={() => setMessage(c)}
              >
                {c}
              </button>
            ))}
          </div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t("placeholder")}
            rows={4}
            className="w-full resize-none rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-dark)] px-3 py-2 text-xs text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
          />
          <button
            type="button"
            className="btn-primary w-fit px-4 py-2 text-xs"
            disabled={loading || !message.trim()}
            onClick={() => void send()}
          >
            {loading ? t("sending") : t("send")}
          </button>
          {error ? (
            <p className="text-xs text-[var(--flux-danger-bright)]">{error}</p>
          ) : null}
          {reply ? (
            <DataFadeIn active>
              <div className="mt-1 max-h-[min(280px,40vh)] overflow-y-auto rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-dark)] p-3">
                <p className="text-[10px] font-bold uppercase text-[var(--flux-text-muted)]">{t("replyLabel")}</p>
                <div className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-[var(--flux-text)]">{reply}</div>
              </div>
            </DataFadeIn>
          ) : null}
        </div>
      </div>
    </section>
  );
}
