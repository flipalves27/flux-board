"use client";

import type { DocTreeNode } from "@/lib/docs-types";

type Props = {
  docs: DocTreeNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: (parentId: string | null) => void;
};

export function DocsSidebarTree({ docs, selectedId, onSelect, onCreate }: Props) {
  return (
    <aside className="w-[300px] shrink-0 border-r border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-mid)] p-3">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase text-[var(--flux-text-muted)]">Flux Docs</div>
        <button className="btn-primary px-2 py-1 text-xs" onClick={() => onCreate(null)}>
          Novo
        </button>
      </div>
      <div className="space-y-1">
        {docs.map((doc) => (
          <div key={doc.id}>
            <button
              className={`w-full rounded px-2 py-1.5 text-left text-sm ${
                selectedId === doc.id
                  ? "bg-[var(--flux-primary-alpha-20)] text-[var(--flux-primary-light)]"
                  : "text-[var(--flux-text)] hover:bg-[var(--flux-chrome-alpha-06)]"
              }`}
              onClick={() => onSelect(doc.id)}
            >
              {doc.title}
            </button>
            {doc.children.length > 0 && (
              <div className="ml-3 mt-1 space-y-1 border-l border-[var(--flux-chrome-alpha-08)] pl-2">
                {doc.children.map((child) => (
                  <button
                    key={child.id}
                    className={`w-full rounded px-2 py-1.5 text-left text-xs ${
                      selectedId === child.id
                        ? "bg-[var(--flux-primary-alpha-20)] text-[var(--flux-primary-light)]"
                        : "text-[var(--flux-text-muted)] hover:bg-[var(--flux-chrome-alpha-06)]"
                    }`}
                    onClick={() => onSelect(child.id)}
                  >
                    {child.title}
                  </button>
                ))}
              </div>
            )}
            <button className="mt-1 text-[10px] text-[var(--flux-text-muted)] hover:text-[var(--flux-primary-light)]" onClick={() => onCreate(doc.id)}>
              + subdoc
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}
