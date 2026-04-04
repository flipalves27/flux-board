"use client";

type ReportsSectionPlaceholderProps = {
  message: string;
};

export function ReportsSectionPlaceholder({ message }: ReportsSectionPlaceholderProps) {
  return (
    <div className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-08)] px-4 py-6 text-sm text-[var(--flux-text-muted)]">
      {message}
    </div>
  );
}

