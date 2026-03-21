"use client";

import type { DocData } from "@/lib/docs-types";

type Props = {
  query: string;
  onQueryChange: (value: string) => void;
  results: DocData[];
  onSelect: (docId: string) => void;
};

export function DocsSearch({ query, onQueryChange, results, onSelect }: Props) {
  return (
    <div className="border-b border-[var(--flux-chrome-alpha-08)] p-3">
      <input
        className="w-full rounded border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-sm text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
        placeholder="Buscar docs..."
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
      />
      {query.trim() && (
        <div className="mt-2 max-h-[180px] overflow-auto rounded border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-mid)]">
          {results.length === 0 ? (
            <div className="px-3 py-2 text-xs text-[var(--flux-text-muted)]">Nenhum resultado.</div>
          ) : (
            results.map((doc) => (
              <button
                key={doc.id}
                className="block w-full border-b border-[var(--flux-chrome-alpha-06)] px-3 py-2 text-left hover:bg-[var(--flux-chrome-alpha-04)]"
                onClick={() => onSelect(doc.id)}
              >
                <div className="text-xs font-semibold text-[var(--flux-text)]">{doc.title}</div>
                <div className="line-clamp-1 text-[11px] text-[var(--flux-text-muted)]">{doc.excerpt}</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
