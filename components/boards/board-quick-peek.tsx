"use client";

import { useEffect, useRef, useState } from "react";
import type { BoardPortfolioMetrics } from "@/lib/board-portfolio-metrics";

/**
 * BoardQuickPeek — preview flutuante no hover de um card de board.
 *
 * Mostra resumo do portfólio + metadados sem abrir o board.
 * Aparece no hover sustentado (300ms). Segue o cursor horizontalmente,
 * mas se estabiliza verticalmente para leitura confortável.
 */

export interface BoardQuickPeekData {
  name: string;
  clientLabel?: string;
  methodology?: string;
  lastUpdated?: string;
  portfolio?: BoardPortfolioMetrics;
}

function formatRelative(iso?: string, isEn = false): string {
  if (!iso) return isEn ? "never" : "nunca";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diff = Date.now() - t;
  if (diff < 60_000) return isEn ? "moments ago" : "agora há pouco";
  const m = Math.round(diff / 60_000);
  if (m < 60) return isEn ? `${m}m ago` : `há ${m}min`;
  const h = Math.round(m / 60);
  if (h < 24) return isEn ? `${h}h ago` : `há ${h}h`;
  const d = Math.round(h / 24);
  if (d < 30) return isEn ? `${d}d ago` : `há ${d}d`;
  const mo = Math.round(d / 30);
  return isEn ? `${mo}mo ago` : `há ${mo}mes`;
}

function Bar({ label, value }: { label: string; value: number | null | undefined }) {
  const v = typeof value === "number" ? value : null;
  const color =
    v === null ? "var(--flux-chrome)" : v >= 72 ? "var(--flux-success)" : v >= 48 ? "var(--flux-primary-light)" : "var(--flux-danger)";
  return (
    <div className="flex items-center gap-2">
      <span className="w-[84px] text-[10px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">
        {label}
      </span>
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full"
        style={{ background: "color-mix(in srgb, var(--flux-chrome) 12%, transparent)" }}
      >
        {v !== null && (
          <div
            className="h-full rounded-full"
            style={{
              width: `${v}%`,
              background: `linear-gradient(90deg, ${color}, color-mix(in srgb, ${color} 75%, var(--flux-primary)))`,
              transition: "width 360ms ease-out",
            }}
          />
        )}
      </div>
      <span
        className="w-8 shrink-0 text-right font-mono text-[11px] tabular-nums text-[var(--flux-text)]"
      >
        {v !== null ? v : "—"}
      </span>
    </div>
  );
}

export function BoardQuickPeek({
  open,
  data,
  locale = "pt-BR",
  anchorRef,
}: {
  open: boolean;
  data: BoardQuickPeekData;
  locale?: string;
  anchorRef: React.RefObject<HTMLElement | null>;
}) {
  const isEn = locale.startsWith("en");
  const [pos, setPos] = useState<{ top: number; left: number; right?: number }>({
    top: 0,
    left: 0,
  });
  const peekRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const isRight = rect.left + rect.width / 2 > vw / 2;
    const top = rect.top + window.scrollY + rect.height + 8;
    if (isRight) {
      const right = vw - rect.right;
      setPos({ top, left: 0, right });
    } else {
      const left = rect.left + window.scrollX;
      setPos({ top, left });
    }
  }, [open, anchorRef]);

  if (!open) return null;

  const cards = data.portfolio?.cardCount ?? 0;
  const hasMetrics = cards > 0;

  return (
    <div
      ref={peekRef}
      className="flux-quick-peek"
      data-open="true"
      role="tooltip"
      style={{
        top: pos.top,
        ...(pos.right !== undefined
          ? { right: pos.right, left: "auto" }
          : { left: pos.left }),
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-display text-sm font-bold text-[var(--flux-text)]">
            {data.name}
          </p>
          <div className="mt-0.5 flex items-center gap-2">
            {data.clientLabel ? (
              <span className="truncate text-[10px] font-semibold text-[var(--flux-secondary)]">
                {data.clientLabel}
              </span>
            ) : null}
            {data.methodology ? (
              <span className="rounded-full border border-[var(--flux-primary-alpha-28)] bg-[var(--flux-primary-alpha-10)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--flux-primary-light)]">
                {data.methodology}
              </span>
            ) : null}
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-[color-mix(in_srgb,var(--flux-primary)_12%,transparent)] px-2 py-0.5 text-[10px] font-bold tabular-nums text-[var(--flux-primary-light)]">
          {cards} {isEn ? "cards" : "cards"}
        </span>
      </div>

      <div className="mt-3 space-y-1.5">
        {hasMetrics ? (
          <>
            <Bar label={isEn ? "Risk" : "Risco"} value={data.portfolio?.risco ?? null} />
            <Bar label={isEn ? "Throughput" : "Throughput"} value={data.portfolio?.throughput ?? null} />
            <Bar
              label={isEn ? "Predict." : "Previsib."}
              value={data.portfolio?.previsibilidade ?? null}
            />
          </>
        ) : (
          <p className="text-[11px] leading-relaxed text-[var(--flux-text-muted)]">
            {isEn
              ? "No cards yet — metrics appear when work starts."
              : "Sem cards ainda — métricas aparecem quando houver trabalho."}
          </p>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-[color-mix(in_srgb,var(--flux-chrome)_10%,transparent)] pt-2 text-[10px] text-[var(--flux-text-muted)]">
        <span>
          {isEn ? "Updated" : "Atualizado"} {formatRelative(data.lastUpdated, isEn)}
        </span>
        <span className="font-semibold text-[var(--flux-primary-light)]">
          {isEn ? "Click to open" : "Clique para abrir"} →
        </span>
      </div>
    </div>
  );
}
