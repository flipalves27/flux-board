"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { DocumentHealthReport } from "@/lib/docs-health";
import type { DocData } from "@/lib/docs-types";

type Props = {
  getHeaders: () => Record<string, string>;
  onSelectDoc: (id: string) => void;
};

function DocList({ items, onSelect }: { items: DocData[]; onSelect: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <ul className="mt-1 max-h-24 space-y-0.5 overflow-auto text-[10px]">
      {items.slice(0, 8).map((d) => (
        <li key={d.id}>
          <button
            type="button"
            className="w-full truncate text-left text-[var(--flux-text-muted)] hover:text-[var(--flux-primary-light)]"
            onClick={() => onSelect(d.id)}
            title={d.title}
          >
            {d.title}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function DocsHealthPanel({ getHeaders, onSelectDoc }: Props) {
  const t = useTranslations("docsPage.health");
  const [report, setReport] = useState<DocumentHealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/docs/health", { headers: getHeaders() });
      const data = (await res.json().catch(() => ({}))) as { report?: DocumentHealthReport; error?: string };
      if (!res.ok) {
        setReport(null);
        setErr(data.error || t("loadError"));
        return;
      }
      if (data.report) setReport(data.report);
    } catch {
      setErr(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [getHeaders, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !report) {
    return (
      <div className="border-b border-[var(--flux-chrome-alpha-08)] px-3 py-2 text-[10px] text-[var(--flux-text-muted)]">{t("loading")}</div>
    );
  }
  if (err && !report) {
    return (
      <div className="flex items-center justify-between border-b border-[var(--flux-chrome-alpha-08)] px-3 py-2 text-[10px] text-amber-600">
        <span>{err}</span>
        <button type="button" className="underline" onClick={() => void load()}>
          {t("retry")}
        </button>
      </div>
    );
  }
  if (!report) return null;

  return (
    <div className="border-b border-[var(--flux-chrome-alpha-08)] px-3 py-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">{t("title")}</div>
        <button type="button" className="text-[10px] text-[var(--flux-primary-light)] hover:underline" onClick={() => void load()}>
          {t("refresh")}
        </button>
      </div>
      <p className="text-[10px] text-[var(--flux-text-muted)]">
        {t("summary", {
          total: report.stats.total,
          stale: report.stats.staleCount,
          noOwner: report.stats.noOwnerCount,
        })}
      </p>
      {report.stats.staleCount > 0 && (
        <div className="mt-1.5">
          <div className="text-[10px] font-medium text-amber-700/90 dark:text-amber-400/90">{t("staleList")}</div>
          <DocList items={report.stale} onSelect={onSelectDoc} />
        </div>
      )}
      {report.stats.noOwnerCount > 0 && (
        <div className="mt-1.5">
          <div className="text-[10px] font-medium text-[var(--flux-text-muted)]">{t("noOwnerList")}</div>
          <DocList items={report.noOwner} onSelect={onSelectDoc} />
        </div>
      )}
    </div>
  );
}
