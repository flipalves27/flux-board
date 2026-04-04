"use client";

type PhaseState = "pending" | "running" | "done" | "error";

const PHASE_ORDER = [
  "parse",
  "chunks",
  "embeddings",
  "retrieval",
  "outline",
  "work",
  "cards",
] as const;

function PhaseIcon({ phase, state }: { phase: (typeof PHASE_ORDER)[number]; state: PhaseState }) {
  const dim = state === "pending" ? "opacity-35" : "";
  const stroke =
    state === "error"
      ? "var(--flux-danger)"
      : state === "done"
        ? "var(--flux-accent)"
        : state === "running"
          ? "var(--flux-primary-light)"
          : "var(--flux-text-muted)";
  const paths: Record<(typeof PHASE_ORDER)[number], React.ReactNode> = {
    parse: <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />,
    chunks: <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />,
    embeddings: <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />,
    retrieval: <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />,
    outline: <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h8M4 18h12" />,
    work: <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />,
    cards: <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />,
  };
  return (
    <svg
      className={`h-5 w-5 shrink-0 ${dim}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke={stroke}
      strokeWidth={2}
      aria-hidden
    >
      {paths[phase]}
    </svg>
  );
}

export function SpecPlanProgressStepper(props: {
  phases: { key: string; label: string; state: PhaseState }[];
  friendlyHints: Record<string, string>;
  statusDone: string;
  statusRunning: string;
  statusError: string;
  statusPending: string;
  expandedKey: string | null;
}) {
  return (
    <div className="space-y-0">
      {props.phases.map((p) => {
        const hint = props.friendlyHints[p.key] ?? "";
        return (
          <div
            key={p.key}
            className={`border-b border-[var(--flux-primary-alpha-08)] last:border-b-0 ${
              p.state === "running" ? "bg-[var(--flux-primary-alpha-06)]" : ""
            }`}
          >
            <div className="flex items-start gap-3 px-1 py-3">
              <PhaseIcon phase={p.key as (typeof PHASE_ORDER)[number]} state={p.state} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-[var(--flux-text)]">{p.label}</span>
                  <span
                    className={`text-[11px] font-bold uppercase tracking-wide ${
                      p.state === "done"
                        ? "text-[var(--flux-accent)]"
                        : p.state === "running"
                          ? "text-[var(--flux-primary-light)]"
                          : p.state === "error"
                            ? "text-[var(--flux-danger)]"
                            : "text-[var(--flux-text-muted)]"
                    }`}
                  >
                    {p.state === "done"
                      ? props.statusDone
                      : p.state === "running"
                        ? props.statusRunning
                        : p.state === "error"
                          ? props.statusError
                          : props.statusPending}
                  </span>
                </div>
                {hint && (p.state === "running" || props.expandedKey === p.key) ? (
                  <p className="mt-1 text-xs leading-relaxed text-[var(--flux-text-muted)]">{hint}</p>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
