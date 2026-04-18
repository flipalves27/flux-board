"use client";

type Link = { cardId: string; title: string; bucket?: string };

type Props = {
  links: Link[];
  onOpenCard?: (cardId: string) => void;
};

export function CardSemanticLinks({ links, onOpenCard }: Props) {
  if (!links.length) return null;
  return (
    <div className="mt-3 rounded-[var(--flux-rad)] border border-[var(--flux-border-muted)] bg-[var(--flux-surface-elevated)]/40 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">Links sugeridos</p>
      <ul className="mt-2 space-y-1">
        {links.map((l) => (
          <li key={l.cardId}>
            <button
              type="button"
              className="text-left text-xs text-[var(--flux-primary-light)] hover:underline"
              onClick={() => onOpenCard?.(l.cardId)}
            >
              {l.title}
              {l.bucket ? <span className="text-[var(--flux-text-muted)]"> · {l.bucket}</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
