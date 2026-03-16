"use client";

import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { KanbanCard } from "./kanban-card";
import type { CardData, BucketConfig } from "@/app/board/[id]/page";

interface KanbanColumnProps {
  bucket: BucketConfig;
  cards: CardData[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  onAddCard: () => void;
  onEditCard: (card: CardData) => void;
  onDeleteCard: (id: string) => void;
  onDeleteColumn?: () => void;
  onSetDirection: (cardId: string, dir: string) => void;
  onOpenDesc?: (card: CardData) => void;
  directions: string[];
  dirColors: Record<string, string>;
}

function DroppableSlot({ id }: { id: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[12px] flex-shrink-0 rounded transition-all duration-200 ease-out ${
        isOver ? "bg-[var(--teal)]/20 ring-2 ring-[var(--teal)]/40 scale-[1.01]" : "hover:bg-[var(--g200)]/25"
      }`}
    />
  );
}

export function KanbanColumn({
  bucket,
  cards,
  collapsed,
  onToggleCollapse,
  onAddCard,
  onEditCard,
  onDeleteCard,
  onDeleteColumn,
  onSetDirection,
  onOpenDesc,
  directions,
  dirColors,
}: KanbanColumnProps) {
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: bucket.key });

  const { setNodeRef: setBucketRef, isOver } = useDroppable({ id: `bucket-${bucket.key}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setSortableRef}
      style={style}
      className={`min-w-[52px] max-w-[290px] flex-1 flex-[1_0_260px] bg-[var(--g50)] rounded-[var(--rad)] border border-[var(--g200)] flex flex-col max-h-[calc(100vh-165px)] transition-all ${
        collapsed ? "min-w-[52px] max-w-[52px] flex-[0_0_52px] cursor-pointer overflow-hidden" : ""
      } ${isOver ? "bg-[rgba(0,201,183,0.08)]" : ""}`}
    >
      <div
        {...attributes}
        {...listeners}
        className="flex items-center gap-2 p-2.5 pb-2 border-b border-[var(--g200)] sticky top-0 bg-[var(--g50)] rounded-t-[var(--rad)] cursor-grab active:cursor-grabbing"
        onClick={collapsed ? onToggleCollapse : undefined}
      >
        <div
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: bucket.color || "#9CA3AF" }}
        />
        <div className="font-display font-bold text-xs text-[var(--g800)] flex-1 truncate">
          {bucket.label}
        </div>
        <div
          className="font-display font-extrabold text-xs text-white px-2 py-0.5 rounded-full min-w-[20px] text-center"
          style={{ background: bucket.color || "#9CA3AF" }}
        >
          {cards.length}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAddCard();
          }}
          className="w-5 h-5 rounded-full border border-[var(--g200)] bg-white text-[var(--g500)] flex items-center justify-center text-[10px] hover:border-[var(--teal)] hover:text-[var(--teal-d)]"
          title="Novo Card"
        >
          +
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse();
          }}
          className="w-5 h-5 rounded-full border border-[var(--g200)] bg-white text-[var(--g500)] flex items-center justify-center text-xs hover:border-[var(--teal)] hover:text-[var(--teal-d)]"
          title={collapsed ? "Expandir" : "Recolher"}
        >
          ◂
        </button>
        {onDeleteColumn && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteColumn();
            }}
            className="w-5 h-5 rounded-full border border-[var(--g200)] bg-white text-[var(--g500)] flex items-center justify-center text-[10px] hover:border-[var(--red)] hover:text-[var(--red)]"
            title="Excluir coluna"
          >
            ×
          </button>
        )}
      </div>

      {collapsed ? (
        <div ref={setBucketRef} className="flex-1 min-h-[50px]" />
      ) : (
        <div ref={setBucketRef} className="p-2 flex-1 overflow-y-auto flex flex-col gap-1 min-h-[50px] scrollbar-kanban">
          {cards.map((c, idx) => (
            <div key={c.id} className="flex flex-col gap-1">
              <DroppableSlot id={`slot-${bucket.key}-${idx}`} />
              <KanbanCard
                card={c}
                directions={directions}
                dirColors={dirColors}
                onEdit={() => onEditCard(c)}
                onDelete={() => onDeleteCard(c.id)}
                onSetDirection={(dir) => onSetDirection(c.id, dir)}
                onOpenDesc={onOpenDesc ? () => onOpenDesc(c) : undefined}
              />
            </div>
          ))}
          <DroppableSlot id={`slot-${bucket.key}-${cards.length}`} />
        </div>
      )}
    </div>
  );
}

