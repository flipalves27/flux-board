export type KanbanMockProps = {
  liveViewLabel: string;
  cols: Array<{ title: string; cards: Array<{ w: string }> }>;
};

export function KanbanMock({ liveViewLabel, cols }: KanbanMockProps) {
  return (
    <div className="home-kanban-mock relative overflow-hidden rounded-[var(--flux-rad-xl)] border p-4 md:p-5" aria-hidden>
      <div className="pointer-events-none absolute -right-8 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full bg-[var(--flux-primary)]/15 blur-3xl" />
      <div className="pointer-events-none absolute -left-6 bottom-0 h-32 w-32 rounded-full bg-[var(--flux-secondary)]/12 blur-3xl" />
      <div className="mb-3 flex items-center justify-between gap-2 border-b border-[var(--flux-primary-alpha-15)] pb-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[var(--flux-danger)]/80" />
          <span className="h-2 w-2 rounded-full bg-[var(--flux-warning)]/80" />
          <span className="h-2 w-2 rounded-full bg-[var(--flux-success)]/80" />
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--flux-text-muted)]">{liveViewLabel}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 md:gap-3">
        {cols.map((col) => (
          <div key={col.title} className="home-kanban-col rounded-[var(--flux-rad)] border p-2 md:p-2.5">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[var(--flux-text-muted)] md:text-[11px]">{col.title}</p>
            <div className="flex flex-col gap-2">
              {col.cards.map((c, i) => (
                <div key={i} className="home-kanban-card rounded-md border px-2 py-2.5 md:py-3">
                  <div className="mb-2 h-1.5 rounded-full bg-[var(--flux-primary-alpha-25)]" style={{ width: c.w }} />
                  <div className="home-kanban-line h-1 rounded" />
                  <div className="home-kanban-line-muted mt-1.5 h-1 w-4/5 rounded" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
