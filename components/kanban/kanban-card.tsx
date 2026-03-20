"use client";

import { useDraggable } from "@dnd-kit/core";
import type { CardData } from "@/app/board/[id]/page";
import { CustomTooltip } from "@/components/ui/custom-tooltip";
import { useTranslations } from "next-intl";

interface KanbanCardProps {
  card: CardData;
  directions: string[];
  dirColors: Record<string, string>;
  onEdit: () => void;
  onDelete: () => void;
  onSetDirection: (dir: string) => void;
  onOpenDesc?: () => void;
  isDragging?: boolean;
}

function daysRemaining(dueDate: string | null): number | null {
  if (!dueDate) return null;
  const due = new Date(dueDate + "T00:00:00").getTime();
  const today = new Date().setHours(0, 0, 0, 0);
  return Math.ceil((due - today) / 86400000);
}

export function KanbanCard({
  card,
  directions,
  dirColors,
  onEdit,
  onDelete,
  onSetDirection,
  onOpenDesc,
  isDragging = false,
}: KanbanCardProps) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `card-${card.id}`,
    data: { card, bucket: card.bucket },
  });

  const t = useTranslations("kanban");

  const dr = daysRemaining(card.dueDate);
  const prioLabel = t(`cardModal.options.priority.${card.priority}`);
  const progLabel = t(`cardModal.options.progress.${card.progress}`);

  const ariaLabel = t("card.ariaLabel", {
    cardTitle: card.title,
    columnLabel: card.bucket,
    priority: prioLabel,
    progress: progLabel,
  });
  const dueClass = dr === null ? "" : dr < 0 ? "text-[var(--flux-danger)]" : dr <= 3 ? "text-[var(--flux-warning)]" : "text-[var(--flux-text-muted)]";
  const dueText =
    dr === null
      ? ""
      : dr < 0
        ? t("card.due.overdue", { days: Math.abs(dr) })
        : dr === 0
          ? t("card.due.today")
          : t("card.due.future", { days: dr });

  const prioClass =
    card.priority === "Urgente"
      ? "bg-[rgba(255,107,107,0.15)] text-[var(--flux-danger)] border border-[rgba(255,107,107,0.35)]"
      : card.priority === "Importante"
        ? "bg-[rgba(255,217,61,0.12)] text-[var(--flux-warning)] border border-[rgba(255,217,61,0.35)]"
        : "bg-[rgba(116,185,255,0.12)] text-[var(--flux-info)] border border-[rgba(116,185,255,0.35)]";

  const progColor =
    card.progress === "Em andamento"
      ? "var(--flux-primary)"
      : card.progress === "Concluída"
        ? "var(--flux-success)"
        : "var(--flux-text-muted)";

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      aria-label={ariaLabel}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest(".dir-btn") && !(e.target as HTMLElement).closest(".card-delete")) {
          onEdit();
        }
      }}
      className={`bg-[var(--flux-surface-elevated)] border border-[rgba(108,92,231,0.2)] rounded-xl p-3.5 cursor-grab active:cursor-grabbing transition-all duration-200 ease-out hover:shadow-[0_4px_20px_rgba(108,92,231,0.15)] hover:border-[var(--flux-primary)]/40 ${
        isDragging ? "opacity-40 scale-[0.98]" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5 card-top">
        <div className="flex items-center gap-1 card-id-wrap">
          <span className="text-[11px] font-bold text-[var(--flux-text-muted)] font-mono card-id">{card.id}</span>

          {onOpenDesc && (
            <CustomTooltip content={t("card.tooltips.description")} position="top">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenDesc();
                }}
                className="card-desc-btn w-[22px] h-[22px] rounded-md border border-[rgba(255,255,255,0.12)] bg-[var(--flux-surface-card)] text-[var(--flux-text-muted)] flex items-center justify-center shrink-0 hover:bg-[var(--flux-primary)] hover:text-white hover:border-[var(--flux-primary)] transition-all duration-200 [&_svg]:w-3 [&_svg]:h-3 [&_svg]:stroke-[2.5]"
                aria-label={t("card.tooltips.description")}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            </CustomTooltip>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (typeof navigator !== "undefined" && navigator.clipboard) {
                void navigator.clipboard.writeText(card.id);
              }
            }}
            className="rounded border border-[rgba(255,255,255,0.12)] px-1 py-0 text-[10px] text-[var(--flux-text-muted)] hover:border-[var(--flux-primary)] hover:text-[var(--flux-primary-light)]"
            title={t("card.tooltips.copyCardId")}
            aria-label={t("card.tooltips.copyCardId")}
          >
            {t("card.actions.copy")}
          </button>
        </div>

        <div className="flex items-center gap-1 card-top-right">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="card-delete w-4 h-4 rounded border-none bg-transparent text-[var(--flux-text-muted)] text-[10px] flex items-center justify-center opacity-35 hover:opacity-100 hover:bg-[rgba(255,107,107,0.15)] hover:text-[var(--flux-danger)]"
          >
            ✕
          </button>
          <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${prioClass}`}>
            {prioLabel}
          </span>
        </div>
      </div>
      <div className="font-display font-bold text-sm text-[var(--flux-text)] leading-tight mb-1.5">
        {card.title}
      </div>
      <div className="text-xs text-[var(--flux-text-muted)] leading-snug mb-2.5 line-clamp-2">
        {card.desc}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {card.tags.map((t) => (
          <span
            key={t}
            className={`text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-[rgba(255,255,255,0.06)] text-[var(--flux-text-muted)] ${
              t === "Incidente" ? "bg-[rgba(253,167,223,0.15)] text-[var(--flux-accent)] border border-[rgba(253,167,223,0.35)] font-semibold" : ""
            }`}
          >
            {t}
          </span>
        ))}
      </div>
      {Array.isArray(card.docRefs) && card.docRefs.length > 0 && (
        <div className="mb-2 text-[11px] text-[var(--flux-primary-light)]">
          {card.docRefs.length} doc(s) vinculado(s)
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <div className="flex items-center gap-1">
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: progColor }}
          />
          <span className="text-[11px] text-[var(--flux-text-muted)] font-medium">{progLabel}</span>
        </div>
        {dr !== null && (
          <span className={`flex items-center gap-1 text-[11px] font-semibold ${dueClass}`}>
            <span>◷</span>
            {dueText}
          </span>
        )}
      </div>
      <div className="border-t border-[rgba(255,255,255,0.06)] pt-2.5 mt-2">
        <span className="text-[11px] font-semibold text-[var(--flux-text-muted)] uppercase block mb-2 font-display">
          {t("card.direction.heading")}
        </span>
        <div className="flex gap-2 flex-wrap">
          {directions.map((d) => {
            const dk = d.toLowerCase();
            const sel = card.direction === dk;
            const dirLabel =
              (() => {
                try {
                  return t(`directions.${dk}`);
                } catch {
                  return d;
                }
              })();
            return (
              <button
                key={d}
                type="button"
                className={`dir-btn text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border transition-all duration-200 ${
                  sel
                    ? `text-white ${dk === "manter" ? "bg-[#059669] border-[#059669]" : dk === "priorizar" ? "bg-[var(--flux-secondary)] border-[var(--flux-secondary)]" : dk === "adiar" ? "bg-[var(--flux-warning)] border-[var(--flux-warning)] text-[#1A1730]" : dk === "cancelar" ? "bg-[var(--flux-danger)] border-[var(--flux-danger)]" : "bg-[var(--flux-text-muted)] border-[var(--flux-text-muted)]"}`
                    : "bg-[var(--flux-surface-card)] text-[var(--flux-text-muted)] border-[rgba(255,255,255,0.12)] hover:border-[var(--flux-primary)] hover:text-[var(--flux-primary-light)] hover:bg-[rgba(108,92,231,0.1)]"
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSetDirection(dk);
                }}
              >
                {dirLabel}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
