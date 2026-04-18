"use client";

import type { FluxyOmnibarResultItem } from "@/lib/fluxy-intent-types";

export function FluxyOmnibarResults(props: {
  items: FluxyOmnibarResultItem[];
  activeIndex: number;
  onSelectIndex: (ix: number) => void;
  onActivate: (item: FluxyOmnibarResultItem) => void;
}) {
  const { items, activeIndex, onSelectIndex, onActivate } = props;
  if (!items.length) {
    return <p className="mt-2 text-xs text-[var(--flux-text-muted)]">Sem resultados ainda — continue a escrever.</p>;
  }
  return (
    <ul role="listbox" aria-label="Resultados" className="mt-2 max-h-48 space-y-1 overflow-y-auto">
      {items.map((item, ix) => (
        <li key={item.id} role="option" aria-selected={ix === activeIndex}>
          <button
            type="button"
            onMouseEnter={() => onSelectIndex(ix)}
            onClick={() => onActivate(item)}
            className={`flex w-full flex-col rounded-[var(--flux-rad)] border px-3 py-2 text-left text-sm ${
              ix === activeIndex
                ? "border-[var(--flux-primary)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text)]"
                : "border-transparent bg-transparent text-[var(--flux-text)] hover:border-[var(--flux-border-muted)]"
            }`}
          >
            <span className="font-medium">{item.title}</span>
            {item.subtitle ? <span className="text-xs text-[var(--flux-text-muted)]">{item.subtitle}</span> : null}
          </button>
        </li>
      ))}
    </ul>
  );
}
