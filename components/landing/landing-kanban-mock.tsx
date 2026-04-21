export type KanbanMockCard = {
  w: string;
  /** Tailwind/bg classes for the progress bar */
  barClassName?: string;
  tag?: { label: string; className: string };
};

export type KanbanMockProps = {
  liveViewLabel: string;
  cols: Array<{ title: string; cards: KanbanMockCard[] }>;
};

const defaultBar = "bg-[var(--flux-primary)]/40";

export function KanbanMock({ liveViewLabel, cols }: KanbanMockProps) {
  return (
    <div
      className="home-kanban-mock relative overflow-hidden rounded-[var(--flux-rad-xl)] border border-[var(--flux-primary-alpha-20)] bg-[color-mix(in_srgb,var(--flux-surface-card)_85%,transparent)] p-3 shadow-[var(--flux-shadow-xl),inset_0_0_0_1px_var(--flux-chrome-alpha-03)] backdrop-blur-sm sm:p-4 md:p-5"
      aria-hidden
    >
      <div className="pointer-events-none absolute -right-8 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full bg-[var(--flux-primary)]/15 blur-3xl" />
      <div className="pointer-events-none absolute -left-6 bottom-0 h-32 w-32 rounded-full bg-[var(--flux-secondary)]/12 blur-3xl" />
      <div className="mb-0 flex items-center justify-between gap-2 border-b border-[var(--flux-primary-alpha-10)] px-0 pb-3 pt-0.5">
        <span className="min-w-0 truncate font-display text-[11px] font-semibold text-[var(--flux-text)] sm:text-xs">{liveViewLabel}</span>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[var(--flux-mock-window-red)]" />
          <span className="h-2 w-2 rounded-full bg-[var(--flux-mock-window-yellow)]" />
          <span className="h-2 w-2 rounded-full bg-[var(--flux-mock-window-green)]" />
        </div>
      </div>
      <div className="grid min-w-0 grid-cols-3 gap-1.5 pt-4 max-[400px]:gap-1.5 sm:gap-2.5 md:gap-3">
        {cols.map((col) => (
          <div
            key={col.title}
            className="home-kanban-col min-w-0 rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-10)] bg-[color-mix(in_srgb,var(--flux-surface-dark)_40%,transparent)] p-2 max-[400px]:p-1.5 sm:p-2.5 md:p-3"
          >
            <p className="mb-2 max-[400px]:mb-1.5 max-[400px]:pb-1.5 max-[400px]:text-[9px] border-b border-[var(--flux-primary-alpha-08)] pb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--flux-text-muted)]">
              {col.title}
            </p>
            <div className="flex flex-col gap-2">
              {col.cards.map((c, i) => (
                <div
                  key={i}
                  className="home-kanban-card group rounded-md border border-[var(--flux-primary-alpha-12)] bg-[color-mix(in_srgb,var(--flux-surface-card)_60%,transparent)] px-2.5 py-2.5 transition-all duration-300 hover:-translate-y-px hover:border-[var(--flux-primary-alpha-30)] md:py-3"
                >
                  <div
                    className={`mb-2 h-[3px] rounded-sm ${c.barClassName ?? defaultBar}`}
                    style={{ width: c.w }}
                  />
                  <div className="home-kanban-line h-0.5 rounded-sm" />
                  <div className="home-kanban-line-muted mt-1.5 h-0.5 w-4/5 rounded-sm" />
                  {c.tag ? (
                    <span
                      className={`mt-1.5 inline-block rounded px-1.5 py-0.5 text-[8px] font-bold ${c.tag.className}`}
                    >
                      {c.tag.label}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
