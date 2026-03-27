"use client";

import type { DocTreeNode } from "@/lib/docs-types";
import { useNavigationVariant } from "@/context/navigation-variant-context";

type Props = {
  docs: DocTreeNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: (parentId: string | null) => void;
};

export function DocsSidebarTree({ docs, selectedId, onSelect, onCreate }: Props) {
  const navVariant = useNavigationVariant();
  const isMinimal = navVariant === "minimal";
  return (
    <aside
      className={`w-[300px] shrink-0 border-r p-3 ${
        isMinimal
          ? "border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-surface-mid)]"
          : "border-[var(--flux-primary-alpha-10)] bg-[linear-gradient(180deg,var(--flux-surface-mid),color-mix(in_srgb,var(--flux-surface-mid)_90%,var(--flux-primary)_10%))]"
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[var(--flux-text-muted)]">Flux Docs</div>
        <button className="btn-primary px-2 py-1 text-xs" onClick={() => onCreate(null)}>
          Novo
        </button>
      </div>
      <div className="space-y-1.5">
        {docs.map((doc) => (
          <div key={doc.id}>
            <button
              className={`w-full text-left text-sm font-medium transition-all duration-200 ${
                isMinimal
                  ? `border-y-0 border-r-0 border-l-2 pl-3 pr-2.5 py-2 rounded-r-lg ${
                      selectedId === doc.id
                        ? "border-l-[var(--flux-primary-light)] bg-[var(--flux-primary-alpha-08)] text-[var(--flux-text)]"
                        : "border-l-transparent text-[var(--flux-text)] hover:bg-[var(--flux-chrome-alpha-06)]"
                    }`
                  : `rounded-lg border px-2.5 py-2 ${
                      selectedId === doc.id
                        ? "border-[var(--flux-primary-alpha-25)] bg-[linear-gradient(135deg,var(--flux-primary-alpha-20),var(--flux-primary-alpha-10))] text-[var(--flux-primary-light)] shadow-[0_6px_20px_var(--flux-primary-alpha-12)]"
                        : "border-transparent text-[var(--flux-text)] hover:border-[var(--flux-primary-alpha-12)] hover:bg-[var(--flux-chrome-alpha-06)]"
                    }`
              }`}
              onClick={() => onSelect(doc.id)}
            >
              {doc.title}
            </button>
            {doc.children.length > 0 && (
              <div
                className={`ml-3 mt-1 space-y-1 border-l pl-2 ${
                  isMinimal ? "border-[var(--flux-chrome-alpha-10)]" : "border-[var(--flux-primary-alpha-10)]"
                }`}
              >
                {doc.children.map((child) => (
                  <button
                    key={child.id}
                    className={`w-full text-left text-xs transition-all duration-200 ${
                      isMinimal
                        ? `border-y-0 border-r-0 border-l-2 pl-2 py-1.5 rounded-r-md ${
                            selectedId === child.id
                              ? "border-l-[var(--flux-primary-light)] bg-[var(--flux-primary-alpha-08)] text-[var(--flux-text)]"
                              : "border-l-transparent text-[var(--flux-text-muted)] hover:bg-[var(--flux-chrome-alpha-06)]"
                          }`
                        : `rounded-md border px-2 py-1.5 ${
                            selectedId === child.id
                              ? "border-[var(--flux-primary-alpha-25)] bg-[var(--flux-primary-alpha-18)] text-[var(--flux-primary-light)]"
                              : "border-transparent text-[var(--flux-text-muted)] hover:border-[var(--flux-primary-alpha-10)] hover:bg-[var(--flux-chrome-alpha-06)]"
                          }`
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
