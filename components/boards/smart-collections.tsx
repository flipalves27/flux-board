"use client";

import { useMemo } from "react";
import type { BoardPortfolioMetrics } from "@/lib/board-portfolio-metrics";

/**
 * SmartCollections — filtros inteligentes gerados a partir do estado do portfólio.
 *
 * Substituem toggles manuais por chips semânticos que respondem às heurísticas dos boards:
 *   🔥 Hot          → atualizados nas últimas 24h
 *   🚀 Momentum     → throughput alto (>65)
 *   ⚠️ Risco        → risco < 48 (atenção)
 *   🧊 Estagnados   → sem atualização > 7d
 *   🎯 Previsíveis  → previsibilidade >= 70
 *
 * Contagem exibida em cada chip. Chips vazios ficam desabilitados (elegância).
 */

type BoardLike = {
  id: string;
  name: string;
  lastUpdated?: string;
  portfolio?: BoardPortfolioMetrics;
};

export type SmartCollectionKey =
  | "all"
  | "hot"
  | "momentum"
  | "risk"
  | "stale"
  | "predictable";

interface CollectionDef {
  key: SmartCollectionKey;
  icon: string;
  labelPt: string;
  labelEn: string;
  tonePt: string;
  toneEn: string;
  match: (b: BoardLike, ctx: { now: number }) => boolean;
}

const COLLECTIONS: CollectionDef[] = [
  {
    key: "all",
    icon: "✦",
    labelPt: "Todos",
    labelEn: "All",
    tonePt: "Mostrar todos os boards",
    toneEn: "Show every board",
    match: () => true,
  },
  {
    key: "hot",
    icon: "🔥",
    labelPt: "Em chamas",
    labelEn: "Hot",
    tonePt: "Atualizados nas últimas 24h",
    toneEn: "Updated in the last 24h",
    match: (b, { now }) => {
      if (!b.lastUpdated) return false;
      const t = new Date(b.lastUpdated).getTime();
      return !Number.isNaN(t) && now - t < 1000 * 60 * 60 * 24;
    },
  },
  {
    key: "momentum",
    icon: "🚀",
    labelPt: "Momentum",
    labelEn: "Momentum",
    tonePt: "Throughput alto (> 65)",
    toneEn: "High throughput (> 65)",
    match: (b) => (b.portfolio?.throughput ?? 0) > 65,
  },
  {
    key: "risk",
    icon: "⚠",
    labelPt: "Atenção",
    labelEn: "At risk",
    tonePt: "Boards com risco crítico (< 48)",
    toneEn: "Boards with critical risk (< 48)",
    match: (b) => {
      const r = b.portfolio?.risco;
      return typeof r === "number" && r < 48;
    },
  },
  {
    key: "stale",
    icon: "🧊",
    labelPt: "Estagnados",
    labelEn: "Stale",
    tonePt: "Sem atualização há mais de 7 dias",
    toneEn: "No updates for more than 7 days",
    match: (b, { now }) => {
      if (!b.lastUpdated) return true;
      const t = new Date(b.lastUpdated).getTime();
      if (Number.isNaN(t)) return true;
      return now - t > 1000 * 60 * 60 * 24 * 7;
    },
  },
  {
    key: "predictable",
    icon: "🎯",
    labelPt: "Previsíveis",
    labelEn: "Predictable",
    tonePt: "Previsibilidade alta (≥ 70)",
    toneEn: "High predictability (≥ 70)",
    match: (b) => (b.portfolio?.previsibilidade ?? 0) >= 70,
  },
];

export function applySmartCollection<T extends BoardLike>(
  boards: T[],
  key: SmartCollectionKey
): T[] {
  if (key === "all") return boards;
  const def = COLLECTIONS.find((c) => c.key === key);
  if (!def) return boards;
  const now = Date.now();
  return boards.filter((b) => def.match(b, { now }));
}

export function SmartCollections({
  boards,
  active,
  onChange,
  locale = "pt-BR",
}: {
  boards: BoardLike[];
  active: SmartCollectionKey;
  onChange: (key: SmartCollectionKey) => void;
  locale?: string;
}) {
  const isEn = locale.startsWith("en");

  const counts = useMemo(() => {
    const now = Date.now();
    const out: Record<SmartCollectionKey, number> = {
      all: boards.length,
      hot: 0,
      momentum: 0,
      risk: 0,
      stale: 0,
      predictable: 0,
    };
    for (const def of COLLECTIONS) {
      if (def.key === "all") continue;
      out[def.key] = boards.filter((b) => def.match(b, { now })).length;
    }
    return out;
  }, [boards]);

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="tablist"
      aria-label={isEn ? "Smart collections" : "Coleções inteligentes"}
    >
      <span
        className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]"
        aria-hidden="true"
      >
        {isEn ? "Smart views" : "Coleções"}
      </span>
      {COLLECTIONS.map((def) => {
        const count = counts[def.key];
        const isActive = active === def.key;
        const disabled = count === 0 && def.key !== "all";
        return (
          <button
            key={def.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-disabled={disabled}
            disabled={disabled}
            onClick={() => !disabled && onChange(def.key)}
            className="flux-chip disabled:cursor-not-allowed disabled:opacity-40"
            data-active={isActive ? "true" : undefined}
            title={isEn ? def.toneEn : def.tonePt}
          >
            <span aria-hidden="true">{def.icon}</span>
            <span>{isEn ? def.labelEn : def.labelPt}</span>
            <span
              className="ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
              style={{
                background: "color-mix(in srgb, var(--flux-chrome) 14%, transparent)",
                color: "var(--flux-text)",
              }}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
