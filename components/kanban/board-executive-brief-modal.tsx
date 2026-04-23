"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";

type Props = {
  open: boolean;
  onClose: () => void;
  markdown: string;
  cached: boolean;
  model?: string;
};

export function BoardExecutiveBriefModal({ open, onClose, markdown, cached, model }: Props) {
  const t = useTranslations("board");
  const contentRef = useRef<HTMLDivElement>(null);

  if (!open) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
    } catch {
      /* clipboard may not be available */
    }
  };

  const handleDownload = () => {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "executive-brief.md";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[var(--flux-z-overlay,900)] bg-black/40 transition-opacity"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="fixed inset-4 z-[var(--flux-z-overlay,900)] m-auto flex max-h-[80vh] max-w-2xl flex-col rounded-xl border border-[var(--flux-border-muted)] bg-[var(--flux-surface-elevated)] shadow-2xl"
        role="dialog"
        aria-modal
        aria-label={t("executiveBrief.title")}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--flux-border-muted)] px-5 py-3.5">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-[var(--flux-primary)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h2 className="text-sm font-semibold text-[var(--flux-text)]">
              {t("executiveBrief.title")}
            </h2>
            {cached && (
              <span className="text-[9px] font-semibold text-[var(--flux-text-muted)] bg-[var(--flux-chrome-alpha-08)] rounded px-1.5 py-0.5">
                {t("executiveBrief.cached")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-md px-2.5 py-1 text-[11px] font-semibold text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-surface-hover)] transition-colors"
            >
              {t("executiveBrief.copy")}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="rounded-md px-2.5 py-1 text-[11px] font-semibold text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-surface-hover)] transition-colors"
            >
              {t("executiveBrief.download")}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-surface-hover)] transition-colors"
              aria-label={t("executiveBrief.close")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div
          ref={contentRef}
          className="flex-1 overflow-y-auto px-6 py-5 prose prose-sm prose-invert max-w-none"
          style={{ color: "var(--flux-text)" }}
        >
          {markdown.split("\n").map((line, i) => {
            if (line.startsWith("### ")) return <h3 key={i} className="text-[13px] font-semibold text-[var(--flux-text)] mt-4 mb-1">{line.slice(4)}</h3>;
            if (line.startsWith("## ")) return <h2 key={i} className="text-[14px] font-bold text-[var(--flux-text)] mt-5 mb-1.5">{line.slice(3)}</h2>;
            if (line.startsWith("# ")) return <h1 key={i} className="text-[16px] font-bold text-[var(--flux-text)] mt-5 mb-2">{line.slice(2)}</h1>;
            if (line.startsWith("- ")) return <li key={i} className="text-[12px] text-[var(--flux-text-muted)] ml-4 list-disc leading-relaxed">{line.slice(2)}</li>;
            if (line.startsWith("**") && line.endsWith("**")) return <p key={i} className="text-[12px] font-semibold text-[var(--flux-text)] leading-relaxed">{line.slice(2, -2)}</p>;
            if (!line.trim()) return <div key={i} className="h-2" />;
            return <p key={i} className="text-[12px] text-[var(--flux-text-muted)] leading-relaxed">{line}</p>;
          })}
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--flux-border-muted)] px-5 py-2 space-y-1">
          <p className="text-[10px] leading-relaxed text-[var(--flux-text-muted)]">{t("executiveBrief.packageHint")}</p>
          {model ? (
            <span className="text-[9px] text-[var(--flux-text-muted)] block">
              {t("executiveBrief.generatedBy", { model })}
            </span>
          ) : null}
        </div>
      </div>
    </>
  );
}
