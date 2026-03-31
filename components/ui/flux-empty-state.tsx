type FluxEmptyStateProps = {
  title: string;
  description: string;
  className?: string;
};

export function FluxEmptyState({ title, description, className }: FluxEmptyStateProps) {
  return (
    <div className={`flux-glass-surface rounded-[var(--flux-rad-lg)] p-6 text-center ${className ?? ""}`}>
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-[var(--flux-primary-alpha-30)] bg-[var(--flux-primary-alpha-10)] text-[var(--flux-primary-light)]">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h10.5v10.5H6.75z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6" />
        </svg>
      </div>
      <p className="font-display text-sm font-semibold text-[var(--flux-text)]">{title}</p>
      <p className="mt-1 text-xs text-[var(--flux-text-muted)]">{description}</p>
    </div>
  );
}

