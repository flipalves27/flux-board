"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { apiJson, getApiHeaders } from "@/lib/api-client";
import type { RetrospectiveResult, RetroItem, RetroAction } from "@/lib/ai-retrospective";

type Props = {
  boardId: string;
  sprintId: string;
  sprintName?: string;
  getHeaders: () => Record<string, string>;
};

const ACTION_ICON: Record<string, string> = {
  process: "⚙",
  team: "◎",
  technical: "◈",
  quality: "◇",
};

const ACTION_COLOR: Record<string, string> = {
  process: "var(--flux-info)",
  team: "var(--flux-secondary)",
  technical: "var(--flux-primary)",
  quality: "var(--flux-accent)",
};

const PRIORITY_DOT: Record<string, string> = {
  high: "var(--flux-danger)",
  medium: "var(--flux-warning)",
  low: "var(--flux-success)",
};

function MetricPill({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: "good" | "bad" | "neutral";
}) {
  const color =
    highlight === "good"
      ? "var(--flux-success)"
      : highlight === "bad"
      ? "var(--flux-danger)"
      : "var(--flux-text-muted)";
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-xl border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-chrome-alpha-04)] px-3 py-2.5">
      <p className="text-[10px] text-[var(--flux-text-muted)]">{label}</p>
      <p className="text-xl font-black leading-none" style={{ color }}>
        {value}
      </p>
    </div>
  );
}

function ItemRow({ item }: { item: RetroItem }) {
  const isWell = item.category === "went_well";
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-chrome-alpha-03)] px-3 py-2.5">
      <span
        className="mt-0.5 shrink-0 text-[14px]"
        style={{ color: isWell ? "var(--flux-success)" : "var(--flux-warning)" }}
      >
        {isWell ? "✓" : "!"}
      </span>
      <div>
        <p className="text-[12px] font-semibold text-[var(--flux-text)]">{item.text}</p>
        {item.subText && (
          <p className="mt-0.5 text-[11px] text-[var(--flux-text-secondary)]">{item.subText}</p>
        )}
      </div>
    </div>
  );
}

function ActionCard({ action }: { action: RetroAction }) {
  const color = ACTION_COLOR[action.actionCategory] ?? "var(--flux-primary)";
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-surface-card)] p-3">
      <span
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[14px]"
        style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
      >
        {ACTION_ICON[action.actionCategory] ?? "→"}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium leading-snug text-[var(--flux-text)]">{action.text}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span
            className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase"
            style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}
          >
            {action.actionCategory}
          </span>
          {action.suggestedOwner && (
            <span className="text-[10px] text-[var(--flux-text-muted)]">→ {action.suggestedOwner}</span>
          )}
          <span
            className="ml-auto h-2 w-2 rounded-full shrink-0"
            style={{ background: PRIORITY_DOT[action.priority] }}
            title={action.priority}
          />
        </div>
      </div>
    </div>
  );
}

function exportMarkdown(result: RetrospectiveResult): string {
  const lines: string[] = [
    `# Retrospectiva: ${result.sprintName}`,
    `_Gerado em ${new Date(result.generatedAt).toLocaleString()}_`,
    "",
    `## Métricas`,
    `- Conclusão: ${result.metrics.completionRate}% (${result.metrics.completedCards}/${result.metrics.plannedCards} cards)`,
    `- Carregados: ${result.metrics.carryoverCards}`,
    `- Bloqueios: ${result.metrics.blockedCards}`,
    result.metrics.velocityVsPrev != null
      ? `- Velocidade vs. sprint anterior: ${result.metrics.velocityVsPrev > 0 ? "+" : ""}${result.metrics.velocityVsPrev}%`
      : "",
    "",
    `## O que foi bem`,
    ...result.wentWell.map((i) => `- **${i.text}** — ${i.subText ?? ""}`),
    "",
    `## O que melhorar`,
    ...result.improvements.map((i) => `- **${i.text}** — ${i.subText ?? ""}`),
    "",
    `## Ações`,
    ...result.actions.map(
      (a) =>
        `- [${a.priority.toUpperCase()}] ${a.text}${a.suggestedOwner ? ` _(${a.suggestedOwner})_` : ""}`
    ),
    "",
    result.llmNarrative ? `## Análise\n${result.llmNarrative}` : "",
  ];
  return lines.filter((l) => l !== "").join("\n");
}

export function AiRetrospectivePanel({ boardId, sprintId, sprintName, getHeaders }: Props) {
  const t = useTranslations("aiRetrospective");
  const locale = useLocale();
  const [result, setResult] = useState<RetrospectiveResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiJson<{ ok: boolean; result: RetrospectiveResult }>(
        `/api/boards/${encodeURIComponent(boardId)}/sprints/${encodeURIComponent(sprintId)}/ai-retro`,
        {
          method: "POST",
          body: JSON.stringify({ locale }),
          headers: getApiHeaders(getHeaders()),
        }
      );
      setResult(data.result);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error"));
    } finally {
      setLoading(false);
    }
  };

  const copyMarkdown = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(exportMarkdown(result));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-2xl border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-surface-card)] overflow-hidden">
      {/* Header */}
      <div
        className="flex items-start justify-between px-5 pt-5 pb-4"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--flux-accent) 10%, var(--flux-surface-card)) 0%, var(--flux-surface-card) 65%)",
        }}
      >
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--flux-accent)]">
            {t("pretitle")}
          </p>
          <h3 className="font-display text-base font-bold text-[var(--flux-text)]">{t("title")}</h3>
          {sprintName && <p className="text-[11px] text-[var(--flux-text-muted)]">{sprintName}</p>}
        </div>
        <div className="flex gap-2">
          {result && (
            <button
              type="button"
              onClick={() => void copyMarkdown()}
              className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--flux-text)] hover:bg-[var(--flux-chrome-alpha-06)]"
            >
              {copied ? "✓ Copiado" : t("copyMd")}
            </button>
          )}
          <button
            type="button"
            onClick={() => void generate()}
            disabled={loading}
            className="rounded-[var(--flux-rad-sm)] px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--flux-accent)" }}
          >
            {loading ? t("generating") : result ? t("regenerate") : t("generate")}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-5 pb-5">
        {error && (
          <p className="mb-3 text-sm text-[var(--flux-danger)]">{error}</p>
        )}

        {!result && !loading && (
          <div className="flex flex-col items-center justify-center gap-3 py-10">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl"
              style={{ background: "color-mix(in srgb, var(--flux-accent) 12%, transparent)" }}
            >
              ◈
            </div>
            <p className="text-center text-[13px] text-[var(--flux-text-muted)] max-w-[220px]">
              {t("emptyHint")}
            </p>
          </div>
        )}

        {loading && (
          <div className="flex flex-col gap-3 py-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-10 rounded-xl border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-chrome-alpha-04)] animate-pulse"
              />
            ))}
          </div>
        )}

        {result && (
          <div className="space-y-5 pt-1">
            {/* LLM Narrative */}
            {result.llmNarrative && (
              <div className="rounded-xl border border-[var(--flux-accent)]/25 bg-[var(--flux-accent)]/6 px-4 py-3">
                <p className="flex items-start gap-2 text-[11px] leading-relaxed text-[var(--flux-text-secondary)]">
                  <span className="shrink-0 text-[var(--flux-accent)] text-[14px] leading-none">✦</span>
                  {result.llmNarrative}
                </p>
              </div>
            )}

            {/* Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <MetricPill
                label={t("metrics.completion")}
                value={`${result.metrics.completionRate}%`}
                highlight={result.metrics.completionRate >= 80 ? "good" : "bad"}
              />
              <MetricPill
                label={t("metrics.carryover")}
                value={result.metrics.carryoverCards}
                highlight={result.metrics.carryoverCards === 0 ? "good" : result.metrics.carryoverCards >= 3 ? "bad" : "neutral"}
              />
              <MetricPill
                label={t("metrics.blockers")}
                value={result.metrics.blockedCards}
                highlight={result.metrics.blockedCards === 0 ? "good" : "bad"}
              />
              {result.metrics.velocityVsPrev !== null ? (
                <MetricPill
                  label={t("metrics.vsPrev")}
                  value={`${result.metrics.velocityVsPrev > 0 ? "+" : ""}${result.metrics.velocityVsPrev}%`}
                  highlight={result.metrics.velocityVsPrev >= 0 ? "good" : "bad"}
                />
              ) : (
                <MetricPill label={t("metrics.cycleTime")} value={result.metrics.avgCycleTimeDays !== null ? `${result.metrics.avgCycleTimeDays}d` : "—"} />
              )}
            </div>

            {/* Went well */}
            {result.wentWell.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--flux-success)]">
                  {t("wentWell")}
                </p>
                {result.wentWell.map((item) => (
                  <ItemRow key={item.id} item={item} />
                ))}
              </div>
            )}

            {/* Improvements */}
            {result.improvements.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--flux-warning)]">
                  {t("improvements")}
                </p>
                {result.improvements.map((item) => (
                  <ItemRow key={item.id} item={item} />
                ))}
              </div>
            )}

            {/* Actions */}
            {result.actions.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--flux-text-muted)]">
                  {t("actions")}
                </p>
                {result.actions.map((action) => (
                  <ActionCard key={action.id} action={action} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
