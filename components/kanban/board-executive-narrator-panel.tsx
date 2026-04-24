"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import type { ReactNode } from "react";
import { apiFetch, apiGet, ApiError } from "@/lib/api-client";
import { useToast } from "@/context/toast-context";
import { buildExecutiveOnePagerMarkdown } from "@/lib/executive-one-pager-markdown";
import type { BoardPortfolioMetrics } from "@/lib/board-portfolio-metrics";
import type { ExecutiveOnePagerTopCard } from "@/lib/executive-one-pager-markdown";
import {
  clampExecutiveStakeholderNote,
  EXECUTIVE_STAKEHOLDER_NOTE_MAX,
} from "@/lib/executive-board-config";

type TabKey = "brief" | "notes";

type Props = {
  boardId: string;
  getHeaders: () => Record<string, string>;
  boardName: string;
  productGoal?: string;
  executiveStakeholderNote?: string;
  onSaveExecutiveStakeholderNote?: (value: string) => void;
  lastUpdatedLabel: string;
  portfolio: BoardPortfolioMetrics;
  topDecisions: ExecutiveOnePagerTopCard[];
};

const briefMarkdownComponents = {
  a({ href, children }: { href?: string; children?: ReactNode }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[var(--flux-primary-light)] underline underline-offset-2 hover:opacity-90"
      >
        {children}
      </a>
    );
  },
  code({ className, children, ...props }: { className?: string; children?: ReactNode }) {
    const inline = !className;
    return inline ? (
      <code className="rounded bg-[var(--flux-chrome-alpha-08)] px-1 py-0.5 font-mono text-[0.85em]" {...props}>
        {children}
      </code>
    ) : (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
  pre({ children }: { children?: ReactNode }) {
    return (
      <pre className="mb-2 overflow-x-auto rounded-lg border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] p-2 font-mono text-[11px]">
        {children}
      </pre>
    );
  },
};

export function BoardExecutiveNarratorPanel({
  boardId,
  getHeaders,
  boardName,
  productGoal,
  executiveStakeholderNote,
  onSaveExecutiveStakeholderNote,
  lastUpdatedLabel,
  portfolio,
  topDecisions,
}: Props) {
  const t = useTranslations("kanban.board.executivePresentation.narrator");
  const { pushToast } = useToast();
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<TabKey>("brief");
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState<string | undefined>();
  const [noteDraft, setNoteDraft] = useState(executiveStakeholderNote ?? "");
  const [noteDirty, setNoteDirty] = useState(false);

  useEffect(() => {
    if (!noteDirty) setNoteDraft(executiveStakeholderNote ?? "");
  }, [executiveStakeholderNote, noteDirty]);

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

  const onePagerPayload = useCallback(
    (brief: string | null | undefined) =>
      buildExecutiveOnePagerMarkdown({
        boardName,
        productGoal,
        executiveStakeholderNote: clampExecutiveStakeholderNote(noteDraft),
        lastUpdatedLabel,
        portfolio,
        topDecisions,
        executiveBriefMarkdown: brief ?? markdown,
      }),
    [boardName, productGoal, noteDraft, lastUpdatedLabel, portfolio, topDecisions, markdown]
  );

  const handleDownloadMd = () => {
    const body = onePagerPayload(markdown);
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
    const bodyMd = onePagerPayload(markdown);
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

  const saveNote = () => {
    if (!onSaveExecutiveStakeholderNote) return;
    const next = clampExecutiveStakeholderNote(noteDraft);
    onSaveExecutiveStakeholderNote(next);
    setNoteDraft(next);
    setNoteDirty(false);
    pushToast({ kind: "success", title: t("noteSaved") });
  };

  return (
    <aside className="w-full xl:w-[min(420px,100%)] shrink-0 rounded-2xl border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] overflow-hidden flex flex-col max-h-[min(88vh,720px)]">
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-[var(--flux-chrome-alpha-08)]">
        <button type="button" onClick={() => setOpen((v) => !v)} className="text-left min-w-0 flex-1" aria-expanded={open}>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--flux-primary)]">{t("kicker")}</span>
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
          <div className="flex border-b border-[var(--flux-chrome-alpha-08)] px-2 pt-1 gap-0.5">
            <button
              type="button"
              onClick={() => setTab("brief")}
              className={`rounded-t-md px-3 py-2 text-[11px] font-semibold transition-colors ${
                tab === "brief"
                  ? "bg-[var(--flux-surface-card)] text-[var(--flux-text)] border border-b-0 border-[var(--flux-chrome-alpha-12)] -mb-px"
                  : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
              }`}
            >
              {t("tabBrief")}
            </button>
            <button
              type="button"
              onClick={() => setTab("notes")}
              className={`rounded-t-md px-3 py-2 text-[11px] font-semibold transition-colors ${
                tab === "notes"
                  ? "bg-[var(--flux-surface-card)] text-[var(--flux-text)] border border-b-0 border-[var(--flux-chrome-alpha-12)] -mb-px"
                  : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
              }`}
            >
              {t("tabNotes")}
            </button>
          </div>

          <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-[var(--flux-chrome-alpha-06)]">
            <button
              type="button"
              onClick={handleCopy}
              disabled={!markdown || tab !== "brief"}
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

          {tab === "brief" ? (
            <>
              {cached && markdown ? (
                <p className="px-3 pt-2 text-[9px] font-medium text-[var(--flux-text-muted)]">{t("cachedHint")}</p>
              ) : null}
              <div className="executive-brief-md flux-docs-prose flex-1 overflow-y-auto px-3 py-3 text-[12px] leading-relaxed text-[var(--flux-text-muted)] scrollbar-flux max-w-none">
                {markdown ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeSanitize]}
                    components={briefMarkdownComponents}
                  >
                    {markdown}
                  </ReactMarkdown>
                ) : loading ? (
                  <div className="space-y-2 animate-pulse" aria-busy="true">
                    <div className="h-4 w-[75%] rounded bg-[var(--flux-chrome-alpha-10)]" />
                    <div className="h-4 w-full rounded bg-[var(--flux-chrome-alpha-08)]" />
                    <div className="h-4 w-[83%] rounded bg-[var(--flux-chrome-alpha-08)]" />
                  </div>
                ) : (
                  <p className="text-[11px]">{t("emptyHint")}</p>
                )}
              </div>
              {model ? (
                <p className="px-3 pb-2 text-[9px] text-[var(--flux-text-muted)] border-t border-[var(--flux-chrome-alpha-06)] pt-2">
                  {t("modelHint", { model })}
                </p>
              ) : null}
            </>
          ) : (
            <div className="flex flex-1 flex-col gap-2 min-h-0 p-3">
              <p className="text-[11px] text-[var(--flux-text-muted)]">{t("notesHint")}</p>
              <textarea
                value={noteDraft}
                onChange={(e) => {
                  setNoteDraft(e.target.value.slice(0, EXECUTIVE_STAKEHOLDER_NOTE_MAX));
                  setNoteDirty(true);
                }}
                disabled={!onSaveExecutiveStakeholderNote}
                rows={10}
                placeholder={t("notesPlaceholder")}
                className="min-h-[160px] flex-1 resize-y rounded-xl border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-3 py-2 text-sm text-[var(--flux-text)] placeholder:text-[var(--flux-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--flux-primary-alpha-35)] disabled:opacity-50"
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!onSaveExecutiveStakeholderNote}
                  onClick={() => {
                    setNoteDraft(executiveStakeholderNote ?? "");
                    setNoteDirty(false);
                  }}
                  className="rounded-lg border border-[var(--flux-chrome-alpha-14)] px-3 py-1.5 text-xs font-semibold text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] disabled:opacity-40"
                >
                  {t("noteRevert")}
                </button>
                <button
                  type="button"
                  disabled={!onSaveExecutiveStakeholderNote}
                  onClick={saveNote}
                  className="rounded-lg bg-[var(--flux-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--flux-primary-foreground)] hover:opacity-95 disabled:opacity-40"
                >
                  {t("noteSave")}
                </button>
                <span className="text-[10px] text-[var(--flux-text-muted)] tabular-nums ml-auto">
                  {noteDraft.length}/{EXECUTIVE_STAKEHOLDER_NOTE_MAX}
                </span>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </aside>
  );
}
