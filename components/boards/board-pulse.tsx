"use client";

import { useMemo } from "react";

/**
 * BoardPulse — indicador de "ritmo cardíaco" do board.
 *
 * Visualiza a freshness do board: quanto mais recente foi a atualização,
 * mais rápido (e mais verde) o pulso. Boards estagnados ficam lentos e âmbar/vermelho.
 * Calculado puramente a partir de `lastUpdated` (sem rede extra).
 */
export type BoardPulseState = "live" | "warm" | "cool" | "cold";

function classifyPulse(lastUpdated?: string): BoardPulseState {
  if (!lastUpdated) return "cold";
  const t = new Date(lastUpdated).getTime();
  if (Number.isNaN(t)) return "cold";
  const ageMs = Date.now() - t;
  const ageMin = ageMs / 60000;
  if (ageMin < 60) return "live";
  if (ageMin < 60 * 24) return "warm";
  if (ageMin < 60 * 24 * 7) return "cool";
  return "cold";
}

const PULSE_META: Record<
  BoardPulseState,
  { color: string; speed: string; labelPt: string; labelEn: string; description: string }
> = {
  live: {
    color: "var(--flux-success)",
    speed: "1.1s",
    labelPt: "Ao vivo",
    labelEn: "Live",
    description: "Atualizado há minutos — time ativo.",
  },
  warm: {
    color: "var(--flux-primary-light)",
    speed: "1.8s",
    labelPt: "Ativo",
    labelEn: "Active",
    description: "Movimentação nas últimas 24h.",
  },
  cool: {
    color: "var(--flux-warning)",
    speed: "2.6s",
    labelPt: "Pausado",
    labelEn: "Paused",
    description: "Sem movimento há alguns dias.",
  },
  cold: {
    color: "var(--flux-danger)",
    speed: "3.4s",
    labelPt: "Dormente",
    labelEn: "Dormant",
    description: "Sem atualização há mais de uma semana.",
  },
};

export function BoardPulse({
  lastUpdated,
  locale = "pt-BR",
  compact = false,
}: {
  lastUpdated?: string;
  locale?: string;
  compact?: boolean;
}) {
  const state = useMemo(() => classifyPulse(lastUpdated), [lastUpdated]);
  const meta = PULSE_META[state];
  const label = locale.startsWith("en") ? meta.labelEn : meta.labelPt;

  return (
    <span
      className="inline-flex items-center gap-1.5"
      title={meta.description}
      aria-label={`${label} — ${meta.description}`}
    >
      <span
        className="flux-pulse-dot"
        style={
          {
            "--flux-pulse-color": meta.color,
            "--flux-pulse-speed": meta.speed,
          } as React.CSSProperties
        }
      />
      {compact ? null : (
        <span
          className="text-[10px] font-semibold uppercase tracking-wide"
          style={{ color: meta.color }}
        >
          {label}
        </span>
      )}
    </span>
  );
}

export { classifyPulse };
