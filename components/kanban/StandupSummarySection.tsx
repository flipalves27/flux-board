"use client";

import { useCallback, useState } from "react";
import type { DailyInsightEntry } from "@/app/board/[id]/page";
import { useTranslations } from "next-intl";

type SuggestedCard = {
  title: string;
  description: string;
  priority: string;
};

type StandupResult = {
  summary: string;
  impediments: string[];
  suggestedCards: SuggestedCard[];
  generatedWithAI?: boolean;
};

export function StandupSummarySection({
  boardId,
  dailyInsights,
  getHeaders,
  onCreateCardsFromInsight,
}: {
  boardId: string;
  dailyInsights: DailyInsightEntry[];
  getHeaders: () => Record<string, string>;
  onCreateCardsFromInsight: (entryId?: string) => void;
}) {
  const t = useTranslations("kanban");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StandupResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(
        `/api/boards/${encodeURIComponent(boardId)}/standup-summary`,
        {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify({ boardId, dailyInsights }),
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error ||
            t("board.standupSummary.error")
        );
      }

      const data = (await response.json()) as StandupResult;
      setResult(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("board.standupSummary.error")
      );
    } finally {
      setLoading(false);
    }
  }, [boardId, dailyInsights, getHeaders, t]);

  const copyToClipboard = useCallback(async () => {
    if (!result) return;

    const lines: string[] = [
      `## ${t("board.standupSummary.title")}`,
      "",
      result.summary,
    ];

    if (result.impediments.length) {
      lines.push("", `### ${t("board.standupSummary.impediments")}`);
      for (const imp of result.impediments) {
        lines.push(`- ${imp}`);
      }
    }

    if (result.suggestedCards.length) {
      lines.push("", `### ${t("board.standupSummary.suggestedCards")}`);
      for (const card of result.suggestedCards) {
        lines.push(`- **${card.title}** (${card.priority}): ${card.description}`);
      }
    }

    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not available
    }
  }, [result, t]);

  const shareToSlack = useCallback(async () => {
    if (!result) return;
    try {
      await fetch("/api/integrations/slack/commands", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          action: "standup_summary",
          boardId,
          text: [
            `*${t("board.standupSummary.title")}*`,
            result.summary,
            result.impediments.length
              ? `\n*${t("board.standupSummary.impediments")}*\n${result.impediments.map((i) => `• ${i}`).join("\n")}`
              : "",
          ]
            .filter(Boolean)
            .join("\n"),
        }),
      });
    } catch {
      // Silently fail for slack
    }
  }, [boardId, getHeaders, result, t]);

  const prioClass = (priority: string) => {
    const p = priority.toLowerCase();
    if (p === "urgente")
      return "bg-[var(--flux-danger-alpha-12)] text-[var(--flux-danger-accent)] border-[var(--flux-danger-alpha-30)]";
    if (p === "importante")
      return "bg-[var(--flux-warning-alpha-12)] text-[var(--flux-warning-foreground)] border-[var(--flux-warning-alpha-30)]";
    return "bg-[var(--flux-info-alpha-12)] text-[var(--flux-info)] border-[var(--flux-info-alpha-30)]";
  };

  return (
    <div className="mt-4 bg-[var(--flux-surface-mid)] border border-[var(--flux-chrome-alpha-08)] rounded-[12px] p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <button
          type="button"
          className="flex items-center gap-2 text-left"
          onClick={() => setExpanded((v) => !v)}
        >
          <span className="w-2 h-2 rounded-full bg-[var(--flux-secondary)] shadow-[var(--flux-shadow-primary-dot)]" />
          <h4 className="font-display font-bold text-sm text-[var(--flux-text)]">
            {t("board.standupSummary.title")}
          </h4>
          <span className="text-[10px] text-[var(--flux-text-muted)]">
            {expanded ? "▲" : "▼"}
          </span>
        </button>

        <button
          type="button"
          className="btn-primary"
          disabled={loading || dailyInsights.length === 0}
          onClick={generate}
        >
          {loading
            ? t("board.standupSummary.generating")
            : t("board.standupSummary.generate")}
        </button>
      </div>

      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          expanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        {error && (
          <div className="mt-2 rounded-[8px] border border-[var(--flux-danger-alpha-30)] bg-[var(--flux-danger-alpha-12)] px-3 py-2">
            <p className="text-xs text-[var(--flux-danger-accent)]">{error}</p>
          </div>
        )}

        {result && (
          <div className="mt-2 space-y-3">
            <div className="bg-[var(--flux-surface-card)] border border-[var(--flux-chrome-alpha-08)] rounded-[8px] p-3">
              <p className="text-xs text-[var(--flux-text)] whitespace-pre-line leading-relaxed">
                {result.summary}
              </p>
            </div>

            {result.impediments.length > 0 && (
              <div className="bg-[var(--flux-surface-card)] border border-[var(--flux-chrome-alpha-08)] rounded-[8px] p-3">
                <div className="text-[11px] uppercase tracking-wide font-bold text-[var(--flux-danger-accent)] mb-1.5">
                  {t("board.standupSummary.impediments")}
                </div>
                <ul className="space-y-1 pl-4 list-disc">
                  {result.impediments.map((imp, i) => (
                    <li
                      key={`imp-${i}`}
                      className="text-xs text-[var(--flux-text-muted)]"
                    >
                      {imp}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.suggestedCards.length > 0 && (
              <div className="bg-[var(--flux-surface-card)] border border-[var(--flux-chrome-alpha-08)] rounded-[8px] p-3">
                <div className="text-[11px] uppercase tracking-wide font-bold text-[var(--flux-primary-light)] mb-1.5">
                  {t("board.standupSummary.suggestedCards")}
                </div>
                <div className="space-y-2">
                  {result.suggestedCards.map((card, i) => (
                    <div
                      key={`sc-${i}`}
                      className="rounded-[8px] border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-mid)] p-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="flex-1 min-w-0 text-xs font-semibold text-[var(--flux-text)] leading-[1.35]">
                          {card.title}
                        </span>
                        <span
                          className={`text-[9px] font-bold px-1.5 py-[1px] rounded-full border whitespace-nowrap ${prioClass(card.priority)}`}
                        >
                          {card.priority}
                        </span>
                      </div>
                      {card.description && (
                        <p className="mt-1 text-[11px] text-[var(--flux-text-muted)] leading-relaxed">
                          {card.description}
                        </p>
                      )}
                      <button
                        type="button"
                        className="btn-bar mt-1.5"
                        onClick={() => onCreateCardsFromInsight()}
                      >
                        {t("board.standupSummary.createCard")}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                className="btn-bar"
                onClick={copyToClipboard}
              >
                {copied
                  ? t("board.standupSummary.copied")
                  : t("board.standupSummary.copy")}
              </button>
              <button
                type="button"
                className="btn-bar"
                onClick={shareToSlack}
              >
                Slack
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
