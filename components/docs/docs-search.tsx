"use client";

import { useTranslations } from "next-intl";
import { DOC_TYPES, type DocData, type DocType } from "@/lib/docs-types";

export type SearchEvidenceItem = { chunkId: string; excerpt: string; score: number };

type Props = {
  query: string;
  onQueryChange: (value: string) => void;
  docTypeFilter: string;
  onDocTypeFilterChange: (value: string) => void;
  results: DocData[];
  onSelect: (docId: string) => void;
  /** When true, RAG / hybrid search is used (server must allow `flux_docs_rag`). */
  hybridEnabled: boolean;
  onHybridChange: (value: boolean) => void;
  showHybridToggle: boolean;
  usedVector: boolean | null;
  evidenceByDocId: Record<string, SearchEvidenceItem>;
};

export function DocsSearch({
  query,
  onQueryChange,
  docTypeFilter,
  onDocTypeFilterChange,
  results,
  onSelect,
  hybridEnabled,
  onHybridChange,
  showHybridToggle,
  usedVector,
  evidenceByDocId,
}: Props) {
  const t = useTranslations("docsPage.search");
  return (
    <div className="border-b border-[var(--flux-chrome-alpha-08)] p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <input
          className="min-w-0 flex-1 rounded border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-sm text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
          placeholder={t("placeholder")}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
        <select
          className="rounded border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-2 py-2 text-xs text-[var(--flux-text)]"
          value={docTypeFilter}
          onChange={(e) => onDocTypeFilterChange(e.target.value)}
          aria-label={t("docTypeFilter")}
        >
          <option value="">{t("allTypes")}</option>
          {DOC_TYPES.map((d: DocType) => (
            <option key={d} value={d}>
              {t(`docTypes.${d}`)}
            </option>
          ))}
        </select>
        {showHybridToggle ? (
          <label className="flex max-w-[220px] cursor-pointer select-none items-start gap-2 text-[10px] leading-tight text-[var(--flux-text-muted)]">
            <input
              type="checkbox"
              className="mt-0.5 accent-[var(--flux-primary)]"
              checked={hybridEnabled}
              onChange={(e) => onHybridChange(e.target.checked)}
            />
            <span>
              <span className="block font-medium text-[var(--flux-text)]">{t("hybridLabel")}</span>
              {t("hybridOnHint")}
            </span>
          </label>
        ) : null}
      </div>
      {query.trim() && (
        <div>
          {hybridEnabled && usedVector !== null ? (
            <p className="mb-1 text-[10px] text-[var(--flux-text-muted)]">
              {usedVector ? t("vectorUsed") : t("textOnly")}
            </p>
          ) : null}
          <div className="mt-1 max-h-[200px] overflow-auto rounded border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-mid)]">
            {results.length === 0 ? (
              <div className="px-3 py-2 text-xs text-[var(--flux-text-muted)]">{t("empty")}</div>
            ) : (
              results.map((doc) => {
                const ev = evidenceByDocId[doc.id];
                return (
                  <button
                    key={doc.id}
                    className="block w-full border-b border-[var(--flux-chrome-alpha-06)] px-3 py-2 text-left hover:bg-[var(--flux-chrome-alpha-04)]"
                    onClick={() => onSelect(doc.id)}
                  >
                    <div className="text-xs font-semibold text-[var(--flux-text)]">{doc.title}</div>
                    {ev ? (
                      <div className="mt-0.5 line-clamp-2 text-[10px] text-[var(--flux-text-muted)]">
                        <span className="text-[var(--flux-primary-light)]/90">{t("evidence")}</span> {ev.excerpt}
                      </div>
                    ) : (
                      <div className="line-clamp-1 text-[11px] text-[var(--flux-text-muted)]">{doc.excerpt}</div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
