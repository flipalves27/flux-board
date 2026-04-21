"use client";

type ReportsTabButtonProps = {
  label: string;
  active: boolean;
  onClick: () => void;
  compact?: boolean;
};

export function ReportsTabButton({ label, active, onClick, compact = false }: ReportsTabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[var(--flux-rad-sm)] font-semibold transition-colors ${
        compact ? "px-3 py-1.5 text-xs" : "px-3 py-2 text-xs"
      } ${
        active
          ? "border border-[var(--flux-primary-alpha-45)] bg-[var(--flux-primary-alpha-18)] text-[var(--flux-primary-light)]"
          : "border border-transparent text-[var(--flux-text-muted)] hover:bg-[var(--flux-chrome-alpha-06)]"
      }`}
    >
      {label}
    </button>
  );
}

