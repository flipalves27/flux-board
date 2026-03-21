"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";

type EmbedPayload = {
  updatedAt: string;
  boardName: string;
  clientLabel?: string;
  kind: string;
  badge: { total: number; inProgress: number; done: number; overdue: number };
  portfolio: { risco: number | null; throughput: number | null; previsibilidade: number | null; cardCount: number };
  miniKanban: Array<{ key: string; label: string; cards: Array<{ title: string; progress: string }> }>;
  heatmap: Array<{ column: string; intensity: number }>;
  okr: { message: string; bars: Array<{ label: string; percent: number }> };
};

export default function EmbedWidgetPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const token = typeof params?.token === "string" ? params.token : "";
  const view = (searchParams.get("kind") || "badge") as "badge" | "kanban" | "heatmap" | "okr";

  const [data, setData] = useState<EmbedPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/embed/${encodeURIComponent(token)}/data`, { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || "Falha ao carregar.");
        if (!cancelled) setData(json as EmbedPayload);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erro.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    const id = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [token]);

  const updatedLabel = data?.updatedAt
    ? new Date(data.updatedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
    : "—";

  return (
    <div className="min-h-[200px] bg-[var(--flux-surface-card)] text-[var(--flux-text)] rounded-[var(--flux-rad-lg)] border border-[var(--flux-primary-alpha-20)] p-4 shadow-[var(--flux-shadow-embed-widget)]">
      {loading && !data && (
        <div className="space-y-3 animate-pulse">
          <div className="h-4 w-1/3 rounded bg-[var(--flux-chrome-alpha-08)]" />
          <div className="h-10 w-full rounded bg-[var(--flux-chrome-alpha-06)]" />
          <div className="h-3 w-2/3 rounded bg-[var(--flux-chrome-alpha-05)]" />
        </div>
      )}
      {error && <p className="text-sm text-[var(--flux-danger)]">{error}</p>}
      {data && (
        <>
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--flux-secondary)] font-display font-semibold">Flux-Board</p>
              <h1 className="text-base font-bold font-display leading-tight">{data.boardName}</h1>
              {data.clientLabel ? <p className="text-xs text-[var(--flux-text-muted)] mt-0.5">{data.clientLabel}</p> : null}
            </div>
            <div className="text-[10px] text-[var(--flux-text-muted)] text-right">
              Atualizado
              <br />
              <span className="font-mono text-[var(--flux-text)]">{updatedLabel}</span>
            </div>
          </div>

          {view === "badge" && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <Stat label="Cards" value={data.badge.total} />
              <Stat label="Em andamento" value={data.badge.inProgress} accent="text-[var(--flux-warning)]" />
              <Stat label="Concluídos" value={data.badge.done} accent="text-[var(--flux-success)]" />
              <Stat label="Atrasados" value={data.badge.overdue} accent="text-[var(--flux-danger)]" />
            </div>
          )}

          {view === "kanban" && (
            <div className="flex gap-2 overflow-x-auto pb-2 mt-2">
              {data.miniKanban.map((col) => (
                <div
                  key={col.key}
                  className="min-w-[140px] max-w-[180px] rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-chrome-alpha-06)] p-2"
                >
                  <p className="text-[10px] font-semibold text-[var(--flux-text-muted)] truncate mb-2">{col.label}</p>
                  <ul className="space-y-1.5">
                    {col.cards.map((c, i) => (
                      <li key={i} className="text-[11px] leading-snug rounded px-2 py-1 bg-[var(--flux-black-alpha-20)]">
                        {c.title}
                      </li>
                    ))}
                    {col.cards.length === 0 && (
                      <li className="text-[10px] text-[var(--flux-text-muted)] italic">Vazio</li>
                    )}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {view === "heatmap" && (
            <div className="mt-2 space-y-2">
              {data.heatmap.map((h, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[10px] text-[var(--flux-text-muted)] w-28 truncate">{h.column}</span>
                  <div className="flex-1 h-2 rounded-full bg-[var(--flux-chrome-alpha-06)] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[var(--flux-primary)] to-[var(--flux-secondary)] transition-all"
                      style={{ width: `${Math.round(h.intensity)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {view === "okr" && (
            <div className="mt-2 space-y-3">
              <p className="text-xs text-[var(--flux-text-muted)]">{data.okr.message}</p>
              {data.okr.bars.map((b, i) => (
                <div key={i}>
                  <div className="flex justify-between text-[10px] mb-1">
                    <span className="truncate">{b.label}</span>
                    <span className="font-mono">{b.percent}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[var(--flux-chrome-alpha-08)] overflow-hidden">
                    <div className="h-full rounded-full bg-[var(--flux-success)]" style={{ width: `${b.percent}%` }} />
                  </div>
                </div>
              ))}
              {data.portfolio.risco !== null && (
                <p className="text-[10px] text-[var(--flux-text-muted)] pt-2 border-t border-[var(--flux-chrome-alpha-06)]">
                  Portfólio — risco {data.portfolio.risco} · throughput {data.portfolio.throughput} · previsibilidade{" "}
                  {data.portfolio.previsibilidade}
                </p>
              )}
            </div>
          )}

          <p className="mt-4 text-center text-[10px] text-[var(--flux-text-muted)]">
            <Link href="https://flux-board.app" className="underline hover:text-[var(--flux-secondary)]">
              Powered by Flux-Board
            </Link>
          </p>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] px-2 py-2 border border-[var(--flux-chrome-alpha-06)]">
      <p className="text-[10px] text-[var(--flux-text-muted)]">{label}</p>
      <p className={`text-xl font-bold font-display tabular-nums ${accent ?? "text-[var(--flux-text)]"}`}>{value}</p>
    </div>
  );
}
