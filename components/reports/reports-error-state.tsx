"use client";

type ReportsErrorStateProps = {
  title: string;
  description: string;
};

export function ReportsErrorState({ title, description }: ReportsErrorStateProps) {
  return (
    <div className="rounded-[var(--flux-rad)] border border-[var(--flux-danger-alpha-35)] bg-[var(--flux-danger-alpha-08)] px-4 py-4 text-sm text-[var(--flux-text)] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--flux-danger-alpha-35)] bg-[var(--flux-danger-alpha-12)] text-[var(--flux-danger)]">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--flux-text)]">{title}</p>
          <p className="mt-1 text-xs text-[var(--flux-text-muted)]">{description}</p>
        </div>
      </div>
    </div>
  );
}

