import type { ReleaseStatus } from "@/lib/schemas";

const TONE: Record<ReleaseStatus, { bg: string; color: string; border: string }> = {
  draft: {
    bg: "var(--flux-chrome-alpha-06)",
    color: "var(--flux-text-muted)",
    border: "var(--flux-chrome-alpha-18)",
  },
  planned: {
    bg: "var(--flux-primary-alpha-08)",
    color: "var(--flux-primary-light)",
    border: "var(--flux-primary-alpha-22)",
  },
  in_review: {
    bg: "var(--flux-warning-alpha-08)",
    color: "var(--flux-warning)",
    border: "var(--flux-warning-alpha-22)",
  },
  staging: {
    bg: "var(--flux-info-alpha-10)",
    color: "var(--flux-info)",
    border: "var(--flux-info-alpha-22)",
  },
  released: {
    bg: "var(--flux-success-alpha-08)",
    color: "var(--flux-success)",
    border: "var(--flux-success-alpha-22)",
  },
  rolled_back: {
    bg: "var(--flux-danger-alpha-10)",
    color: "var(--flux-danger)",
    border: "var(--flux-danger-alpha-22)",
  },
};

export function ReleaseStatusPill({ status, label }: { status: ReleaseStatus; label: string }) {
  const tone = TONE[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: tone.bg, color: tone.color, borderColor: tone.border }}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: tone.color }} />
      {label}
    </span>
  );
}
