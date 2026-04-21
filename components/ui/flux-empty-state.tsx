type FluxEmptyStateVariant = "default" | "muted" | "search";

type FluxEmptyStateProps = {
  title: string;
  description: string;
  className?: string;
  variant?: FluxEmptyStateVariant;
  /** Optional primary action (e.g. clear filters, create item). */
  action?: { label: string; onClick: () => void };
};

export function FluxEmptyState({ title, description, className, variant = "default", action }: FluxEmptyStateProps) {
  const tone =
    variant === "muted"
      ? "border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-chrome-alpha-04)]"
      : variant === "search"
        ? "border-[var(--flux-info-alpha-22)] bg-[var(--flux-info-alpha-10)]"
        : "border-[var(--flux-primary-alpha-30)] bg-[var(--flux-primary-alpha-10)]";
  const iconTone = variant === "default" ? "text-[var(--flux-primary-light)]" : "text-[var(--flux-text-muted)]";

  return (
    <div className={`flux-glass-surface rounded-[var(--flux-rad-lg)] p-6 text-center ${className ?? ""}`}>
      <div
        className={`mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border ${tone} ${iconTone}`}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h10.5v10.5H6.75z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6" />
        </svg>
      </div>
      <p className="font-display text-sm font-semibold text-[var(--flux-text)]">{title}</p>
      <p className="mt-1 text-xs text-[var(--flux-text-muted)]">{description}</p>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 inline-flex items-center justify-center rounded-[var(--flux-rad-sm)] border border-[var(--flux-primary-alpha-25)] bg-[var(--flux-primary-alpha-12)] px-3 py-1.5 text-xs font-semibold text-[var(--flux-primary-light)] hover:bg-[var(--flux-primary-alpha-18)]"
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

