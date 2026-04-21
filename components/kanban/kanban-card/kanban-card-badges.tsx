"use client";

import { CustomTooltip } from "@/components/ui/custom-tooltip";
import type { SubtaskItem } from "./kanban-card-utils";

export function AiSparkleIcon({ className = "w-3 h-3" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 2l2.09 6.26L20.18 10l-6.09 1.74L12 18l-2.09-6.26L3.82 10l6.09-1.74L12 2z" />
    </svg>
  );
}

export function AiBlockedHintBadge({ tooltip }: { tooltip: string }) {
  return (
    <CustomTooltip content={tooltip} position="top">
      <span
        className="absolute top-1.5 right-8 z-[5] flex items-center justify-center w-[22px] h-[22px] rounded-full cursor-default"
        style={{
          background: "var(--flux-primary-alpha-18)",
          border: "1px solid var(--flux-primary-alpha-35)",
          animation: "flux-ai-pulse 2.4s ease-in-out infinite",
        }}
        aria-label={tooltip}
      >
        <AiSparkleIcon className="w-2.5 h-2.5 text-[var(--flux-primary-light)]" />
      </span>
    </CustomTooltip>
  );
}

export function AiRefineHintBadge({ tooltip }: { tooltip: string }) {
  return (
    <CustomTooltip content={tooltip} position="top">
      <span
        className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border cursor-default border-[var(--flux-primary-alpha-35)] bg-[var(--flux-primary-alpha-10)] text-[var(--flux-primary-light)]"
        aria-label={tooltip}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-2.5 h-2.5" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
        <AiSparkleIcon className="w-2 h-2" />
      </span>
    </CustomTooltip>
  );
}

export function RiskScoreBadge({ score }: { score: number }) {
  const color =
    score <= 40 ? "var(--flux-success)" : score <= 70 ? "var(--flux-warning)" : "var(--flux-danger)";
  const label = score <= 40 ? "Baixo" : score <= 70 ? "Médio" : "Alto";
  const tooltipContent = `Risco: ${score}/100 — ${label}`;
  return (
    <CustomTooltip content={tooltipContent} position="top">
      <span
        className="absolute top-0 right-0 w-2 h-2 rounded-full cursor-default"
        style={{
          background: color,
          boxShadow: `0 0 4px 1px color-mix(in srgb, ${color} 50%, transparent)`,
        }}
        aria-label={tooltipContent}
      />
    </CustomTooltip>
  );
}

export function MatrixWeightBadge({ weight, band }: { weight: number; band?: "low" | "medium" | "high" | "critical" }) {
  const tone =
    band === "critical"
      ? "border-[var(--flux-danger-alpha-35)] bg-[var(--flux-danger-alpha-12)] text-[var(--flux-danger)]"
      : band === "high"
        ? "border-[var(--flux-warning-alpha-35)] bg-[var(--flux-warning-alpha-10)] text-[var(--flux-warning)]"
        : band === "medium"
          ? "border-[var(--flux-secondary-alpha-35)] bg-[var(--flux-secondary-alpha-10)] text-[var(--flux-secondary)]"
          : "border-[var(--flux-chrome-alpha-20)] bg-[var(--flux-chrome-alpha-08)] text-[var(--flux-text-muted)]";
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${tone}`}>
      Peso {weight}
    </span>
  );
}

export function SubtaskProgressMini({ subtasks }: { subtasks: SubtaskItem[] }) {
  if (!subtasks.length) return null;
  const done = subtasks.filter((s) => s.status === "done").length;
  const blocked = subtasks.filter((s) => s.status === "blocked").length;
  const total = subtasks.length;
  const pct = Math.round((done / total) * 100);
  const tooltipContent = `Subtasks: ${done} de ${total} concluídas${blocked > 0 ? `, ${blocked} bloqueada${blocked > 1 ? "s" : ""}` : ""} (${pct}%)`;

  return (
    <CustomTooltip content={tooltipContent} position="top">
      <div className="flex items-center gap-1 mb-2" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-[3px]">
          {subtasks.map((s) => (
            <span
              key={s.id}
              className="inline-block w-[5px] h-[5px] rounded-full"
              style={{
                background:
                  s.status === "done"
                    ? "var(--flux-success)"
                    : s.status === "blocked"
                      ? "var(--flux-danger)"
                      : s.status === "in_progress"
                        ? "var(--flux-primary)"
                        : "color-mix(in srgb, var(--flux-text-muted) 30%, transparent)",
              }}
            />
          ))}
        </div>
        <span className="text-[10px] text-[var(--flux-text-muted)] tabular-nums font-medium">
          {done}/{total}
        </span>
      </div>
    </CustomTooltip>
  );
}
