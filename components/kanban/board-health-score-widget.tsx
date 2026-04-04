"use client";

import { useEffect, useState } from "react";
import { apiGet, ApiError } from "@/lib/api-client";

type HealthData = {
  overall: number;
  grade: string;
  topIssues: string[];
  topStrengths: string[];
};

type Props = {
  boardId: string;
  getHeaders: () => Record<string, string>;
};

const SIZE = 48;
const STROKE = 4;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function scoreColor(score: number): string {
  if (score >= 70) return "var(--flux-success)";
  if (score >= 40) return "var(--flux-warning)";
  return "var(--flux-danger)";
}

export function BoardHealthScoreWidget({ boardId, getHeaders }: Props) {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    (async () => {
      try {
        const data = await apiGet<{ health: HealthData }>(
          `/api/boards/${encodeURIComponent(boardId)}/health-score`,
          getHeaders(),
        );
        if (cancelled) return;
        setHealth(data.health);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && (e.status === 403 || e.status === 401)) {
          setHealth(null);
        }
        setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [boardId, getHeaders]);

  if (loading) {
    return (
      <div
        className="shrink-0 rounded-full flux-animate-skeleton-pulse bg-[var(--flux-chrome-alpha-12)]"
        style={{ width: SIZE, height: SIZE }}
        aria-label="Loading health score"
      />
    );
  }

  if (error || !health) {
    return (
      <div
        className="flex items-center justify-center shrink-0 text-[var(--flux-text-muted)] text-[10px] font-semibold"
        style={{ width: SIZE, height: SIZE }}
        title="Health score unavailable"
      >
        —
      </div>
    );
  }

  const color = scoreColor(health.overall);
  const offset = CIRCUMFERENCE - (health.overall / 100) * CIRCUMFERENCE;

  return (
    <div
      className="relative shrink-0 cursor-default"
      style={{ width: SIZE, height: SIZE }}
      title={`Health ${health.overall} (${health.grade})\n${health.topStrengths[0] ?? ""}`}
    >
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="-rotate-90"
        width={SIZE}
        height={SIZE}
        aria-hidden
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="var(--flux-chrome-alpha-12)"
          strokeWidth={STROKE}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeDasharray={`${CIRCUMFERENCE}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <span
        className="absolute inset-0 flex flex-col items-center justify-center"
        style={{ color }}
      >
        <span className="text-[13px] font-bold tabular-nums leading-none">
          {health.overall}
        </span>
        <span className="text-[7px] font-semibold text-[var(--flux-text-muted)] leading-none mt-0.5">
          Health
        </span>
      </span>
    </div>
  );
}
