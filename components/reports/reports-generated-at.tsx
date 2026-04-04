"use client";

type ReportsGeneratedAtProps = {
  label: string;
  value: string;
};

export function ReportsGeneratedAt({ label, value }: ReportsGeneratedAtProps) {
  return (
    <p className="text-[11px] text-[var(--flux-text-muted)]">
      {label} {value}
    </p>
  );
}

