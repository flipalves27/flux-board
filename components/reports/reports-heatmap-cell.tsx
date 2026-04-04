"use client";

type ReportsHeatmapCellProps = {
  name: string;
  risk: number | null;
  cardCount: number;
  background: string;
};

export function ReportsHeatmapCell({ name, risk, cardCount, background }: ReportsHeatmapCellProps) {
  return (
    <div
      className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-08)] px-3 py-2.5 text-left transition-transform hover:scale-[1.02]"
      style={{ background }}
    >
      <p className="truncate text-xs font-bold text-[var(--flux-text)]">{name}</p>
      <p className="mt-1 font-mono text-[10px] text-[var(--flux-text-muted)]">risco {risk ?? "—"} · {cardCount} cards</p>
    </div>
  );
}

