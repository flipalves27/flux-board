"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, apiGet, ApiError } from "@/lib/api-client";
import { useToast } from "@/context/toast-context";
import { buildExecutiveOnePagerMarkdown } from "@/lib/executive-one-pager-markdown";
import type { BoardPortfolioMetrics } from "@/lib/board-portfolio-metrics";
import type { ExecutiveOnePagerTopCard } from "@/lib/executive-one-pager-markdown";

type Props = {
  boardId: string;
  getHeaders: () => Record<string, string>;
  boardName: string;
  productGoal?: string;
  lastUpdatedLabel: string;
  portfolio: BoardPortfolioMetrics;
  topDecisions: ExecutiveOnePagerTopCard[];
};

export function BoardExecutiveNarratorPanel({
  boardId,
  getHeaders,
  boardName,
  productGoal,
  lastUpdatedLabel,
  portfolio,
  topDecisions,
}: Props) {
  const t = useTranslations("kanban.board.executivePresentation.narrator");
  const { pushToast } = useToast();
  const [open, setOpen] = useState(true);
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState<string | undefined>();

  const loadBrief = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<{ markdown: string; cached: boolean; model?: string }>(
        `/api/boards/${encodeURIComponent(boardId)}/executive-brief-ai`,
        getHeaders()
      );
      setMarkdown(data.markdown);
      setCached(Boolean(data.cached));
      setModel(data.model);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : t("error");
      pushToast({ kind: "error", title: msg });
    } finally {
      setLoading(false);
    }
  }, [boardId, getHeaders, pushToast, t]);

  const handleCopy = async () => {
    if (!markdown) return;
    try {
      await navigator.clipboard.writeText(markdown);
      pushToast({ kind: "success", title: t("copied") });
    } catch {
      pushToast({ kind: "error", title: t("copyFailed") });
    }
  };

  const handleDownloadMd = () => {
    const body = buildExecutiveOnePagerMarkdown({
      boardName,
      productGoal,
      lastUpdatedLabel,
      portfolio,
      topDecisions,
      executiveBriefMarkdown: markdown,
    });
    const blob = new Blob([body], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "executive-one-pager.md";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    pushToast({ kind: "success", title: t("onePagerDownloaded") });
  };

  const handleSharePortal = async () => {
    const bodyMd = buildExecutiveOnePagerMarkdown({
      boardName,
      productGoal,
      lastUpdatedLabel,
      portfolio,
      topDecisions,
      executiveBriefMarkdown: markdown,
    });
    try {
      const res = await apiFetch(`/api/boards/${encodeURIComponent(boardId)}/brief-share`, {
        method: "POST",
        headers: { ...getHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ markdown: bodyMd }),
      });
      const json = (await res.json()) as { error?: string; path?: string; token?: string };
      if (!res.ok) {
        pushToast({ kind: "error", title: json.error ?? t("shareFailed") });
        return;
      }
      const path = json.path?.trim();
      if (path && typeof window !== "undefined") {
        const url = `${window.location.origin}${path}`;
        try {
          await navigator.clipboard.writeText(url);
          pushToast({ kind: "success", title: t("shareReady"), description: url.slice(0, 120) });
        } catch {
          pushToast({ kind: "success", title: t("shareReady"), description: url });
        }
      } else {
        pushToast({ kind: "success", title: t("shareCreated") });
      }
    } catch {
      pushToast({ kind: "error", title: t("shareFailed") });
    }
  };

  return (
    <aside className="w-full xl:w-[min(100%,380px)] shrink-0 rounded-2xl border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] overflow-hidden flex flex-col max-h-[min(88vh,720px)]">
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-[var(--flux-chrome-alpha-08)]">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-left min-w-0 flex-1"
          aria-expanded={open}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--flux-primary)]">
            {t("kicker")}
          </span>
          <span className="block text-sm font-semibold text-[var(--flux-text)] truncate">{t("title")}</span>
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => void loadBrief()}
            disabled={loading}
            className="rounded-lg border border-[var(--flux-chrome-alpha-12)] px-2 py-1 text-[11px] font-semibold text-[var(--flux-text-muted)] hover:border-[var(--flux-primary-alpha-35)] hover:text-[var(--flux-text)] disabled:opacity-50"
          >
            {loading ? t("loading") : markdown ? t("refresh") : t("load")}
          </button>
        </div>
      </div>

      {open ? (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-[var(--flux-chrome-alpha-06)]">
            <button
              type="button"
              onClick={handleCopy}
              disabled={!markdown}
              className="rounded-md px-2 py-1 text-[10px] font-semibold text-[var(--flux-text-muted)] hover:bg-[var(--flux-chrome-alpha-08)] disabled:opacity-40"
            >
              {t("copyBrief")}
            </button>
            <button
              type="button"
              onClick={handleDownloadMd}
              className="rounded-md px-2 py-1 text-[10px] font-semibold text-[var(--flux-text-muted)] hover:bg-[var(--flux-chrome-alpha-08)]"
            >
              {t("downloadOnePager")}
            </button>
            <button
              type="button"
              onClick={() => void handleSharePortal()}
              className="rounded-md px-2 py-1 text-[10px] font-semibold text-[var(--flux-text-muted)] hover:bg-[var(--flux-chrome-alpha-08)]"
            >
              {t("sharePortal")}
            </button>
          </div>
          {cached && markdown ? (
            <p className="px-3 pt-2 text-[9px] font-medium text-[var(--flux-text-muted)]">{t("cachedHint")}</p>
          ) : null}
          <div
            className="flex-1 overflow-y-auto px-3 py-3 text-[12px] leading-relaxed text-[var(--flux-text-muted)] scrollbar-flux"
            style={{ color: "var(--flux-text-muted)" }}
          >
            {markdown ? (
              markdown.split("\n").map((line, i) => {
                if (line.startsWith("### "))
                  return (
                    <h3 key={i} className="text-[12px] font-semibold text-[var(--flux-text)] mt-3 mb-1">
                      {line.slice(4)}
                    </h3>
                  );
                if (line.startsWith("## "))
                  return (
                    <h2 key={i} className="text-[13px] font-bold text-[var(--flux-text)] mt-4 mb-1">
                      {line.slice(3)}
                    </h2>
                  );
                if (line.startsWith("# "))
                  return (
                    <h1 key={i} className="text-[14px] font-bold text-[var(--flux-text)] mb-2">
                      {line.slice(2)}
                    </h1>
                  );
                if (line.startsWith("- "))
                  return (
                    <li key={i} className="ml-4 list-disc">
                      {line.slice(2)}
                    </li>
                  );
                if (!line.trim()) return <div key={i} className="h-2" />;
                return (
                  <p key={i} className="mb-1">
                    {line}
                  </p>
                );
              })
            ) : (
              <p className="text-[11px]">{t("emptyHint")}</p>
            )}
          </div>
          {model ? (
            <p className="px-3 pb-2 text-[9px] text-[var(--flux-text-muted)] border-t border-[var(--flux-chrome-alpha-06)] pt-2">
              {t("modelHint", { model })}
            </p>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
