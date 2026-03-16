"use client";

import { useDraggable } from "@dnd-kit/core";
import type { CardData } from "@/app/board/[id]/page";

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

  const dr = daysRemaining(card.dueDate);
  const dueClass = dr === null ? "" : dr < 0 ? "text-[var(--red)]" : dr <= 3 ? "text-[var(--amber)]" : "text-[var(--g400)]";
  const dueText =
    dr === null ? "" : dr < 0 ? `${Math.abs(dr)}d atraso` : dr === 0 ? "Hoje" : `${dr}d`;

  const prioClass =
    card.priority === "Urgente"
      ? "bg-[var(--red-bg)] text-[var(--red)] border border-[var(--red-b)]"
      : card.priority === "Importante"
        ? "bg-[var(--amber-bg)] text-[var(--amber)] border border-[var(--amber-b)]"
        : "bg-[var(--blue-bg)] text-[var(--blue)] border border-[var(--blue-b)]";

  const progColor =
    card.progress === "Em andamento"
      ? "var(--teal)"
      : card.progress === "Concluída"
        ? "var(--green)"
        : "var(--g400)";

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest(".dir-btn") && !(e.target as HTMLElement).closest(".card-delete")) {
          onEdit();
        }
      }}
      className={`bg-white border border-[var(--g200)] rounded-xl p-3.5 cursor-grab active:cursor-grabbing transition-all duration-200 ease-out hover:shadow-[0_4px_20px_rgba(10,31,63,0.08)] hover:border-[var(--g300)] ${
        isDragging ? "opacity-40 scale-[0.98]" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5 card-top">
        <div className="flex items-center gap-0 card-id-wrap">
          <span className="text-[11px] font-bold text-[var(--g400)] font-mono card-id">{card.id}</span>
        </div>
        <div className="flex items-center gap-1 card-top-right">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="card-delete w-4 h-4 rounded border-none bg-transparent text-[var(--g400)] text-[10px] flex items-center justify-center opacity-35 hover:opacity-100 hover:bg-[var(--red-bg)] hover:text-[var(--red)]"
          >
            ✕
          </button>
          {onOpenDesc && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenDesc();
              }}
              className="card-desc-btn w-[22px] h-[22px] rounded-md border border-[var(--g200)] bg-[var(--g50)] text-[var(--g500)] flex items-center justify-center shrink-0 hover:bg-[var(--teal)] hover:text-white hover:border-[var(--teal)] transition-all duration-200 [&_svg]:w-3 [&_svg]:h-3 [&_svg]:stroke-[2.5]"
              title="Ver descrição"
              aria-label="Ver descrição"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          )}
          <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${prioClass}`}>
            {card.priority}
          </span>
        </div>
      </div>
      <div className="font-display font-bold text-sm text-[var(--g800)] leading-tight mb-1.5">
        {card.title}
      </div>
      <div className="text-xs text-[var(--g500)] leading-snug mb-2.5 line-clamp-2">
        {card.desc}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {card.tags.map((t) => (
          <span
            key={t}
            className={`text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-[var(--g100)] text-[var(--g500)] ${
              t === "Incidente" ? "bg-[var(--orange-bg)] text-[var(--orange)] border border-[var(--orange-b)] font-semibold" : ""
            }`}
          >
            {t}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <div className="flex items-center gap-1">
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: progColor }}
          />
          <span className="text-[11px] text-[var(--g400)] font-medium">{card.progress}</span>
        </div>
        {dr !== null && (
          <span className={`flex items-center gap-1 text-[11px] font-semibold ${dueClass}`}>
            <span>◷</span>
            {dueText}
          </span>
        )}
      </div>
      <div className="border-t border-[var(--g100)] pt-2.5 mt-2">
        <span className="text-[11px] font-semibold text-[var(--g400)] uppercase block mb-2">
          Direcionamento
        </span>
        <div className="flex gap-2 flex-wrap">
          {directions.map((d) => {
            const dk = d.toLowerCase();
            const sel = card.direction === dk;
            return (
              <button
                key={d}
                type="button"
                className={`dir-btn text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border transition-all duration-200 ${
                  sel
                    ? `text-white ${dk === "manter" ? "bg-[#059669] border-[#059669]" : dk === "priorizar" ? "bg-[var(--teal-d)] border-[var(--teal-d)]" : dk === "adiar" ? "bg-[var(--amber)] border-[var(--amber)] text-[var(--g800)]" : dk === "cancelar" ? "bg-[var(--red)] border-[var(--red)]" : "bg-[var(--g600)] border-[var(--g600)]"}`
                    : "bg-white text-[var(--g500)] border-[var(--g200)] hover:border-[var(--teal)] hover:text-[var(--teal-d)] hover:bg-[#F0FDFB]"
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSetDirection(dk);
                }}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
