"use client";

import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { KanbanCard } from "./kanban-card";
import type { CardData, BucketConfig } from "@/app/board/[id]/page";
import { CustomTooltip } from "@/components/ui/custom-tooltip";
import { useTranslations } from "next-intl";

interface KanbanColumnProps {
  bucket: BucketConfig;
  cards: CardData[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  onAddCard: () => void;
  onEditCard: (card: CardData) => void;
  onDeleteCard: (id: string) => void;
  onRenameColumn?: () => void;
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
      aria-hidden="true"
      role="presentation"
      className={`min-h-[12px] flex-shrink-0 rounded transition-all duration-200 ease-out ${
        isOver ? "bg-[var(--flux-primary)]/20 ring-2 ring-[var(--flux-primary)]/40 scale-[1.01]" : "hover:bg-[var(--flux-surface-hover)]"
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
  onRenameColumn,
  onDeleteColumn,
  onSetDirection,
  onOpenDesc,
  directions,
  dirColors,
}: KanbanColumnProps) {
  const t = useTranslations("kanban");
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
      className={`min-w-[260px] max-w-[380px] flex-1 flex-[1_1_260px] bg-[var(--flux-surface-card)] rounded-[var(--flux-rad)] border border-[var(--flux-border-default)] flex flex-col max-h-[calc(100vh-165px)] transition-all shadow-[inset_0_1px_0_var(--flux-border-muted),0_8px_28px_-16px_rgba(0,0,0,0.35)] ${
        collapsed ? "min-w-[72px] max-w-[72px] flex-[0_0_72px] cursor-pointer overflow-hidden min-h-0 h-fit" : ""
      } ${isOver ? "bg-[var(--flux-primary-glow)] ring-1 ring-[var(--flux-border-default)]" : ""}`}
    >
      {collapsed ? (
        <CustomTooltip content={t("column.collapsedTooltip", { label: bucket.label, count: cards.length })} position="right">
          <div
            ref={setBucketRef}
            {...attributes}
            {...listeners}
            className="flex items-center gap-2 px-2 py-2 rounded-[var(--flux-rad)] cursor-grab active:cursor-grabbing hover:bg-[var(--flux-surface-hover)] transition-colors"
            onClick={onToggleCollapse}
            aria-label={t("column.collapsedAriaLabel", { label: bucket.label, count: cards.length })}
          >
            <div
              className="w-3 h-3 rounded-full shrink-0 border border-[var(--flux-border-subtle)]"
              style={{ background: bucket.color || "#9B97C2" }}
              aria-hidden
            />
            <span className="font-display font-bold text-sm text-[var(--flux-text)] tabular-nums">
              {cards.length}
            </span>
          </div>
        </CustomTooltip>
      ) : (
        <>
      <div
        {...attributes}
        {...listeners}
        className="flex items-center gap-3 px-3 py-3 border-b border-[var(--flux-border-muted)] sticky top-0 bg-[var(--flux-surface-card)] rounded-t-[var(--flux-rad)] cursor-grab active:cursor-grabbing shadow-[inset_0_1px_0_var(--flux-border-muted)]"
        aria-label={t("column.dragAriaLabel", { label: bucket.label, count: cards.length })}
      >
        <div
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: bucket.color || "#9B97C2" }}
        />
        <div className="font-display font-bold text-xs text-[var(--flux-text)] flex-1 min-w-0 truncate">
          {bucket.label}
        </div>
        <div
          className="font-display font-bold text-xs text-white px-2.5 py-0.5 rounded-full min-w-[22px] text-center shrink-0"
          style={{ background: bucket.color || "#9B97C2" }}
        >
          {cards.length}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <CustomTooltip content={t("column.tooltips.newCard")} position="top">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAddCard();
              }}
              className="w-6 h-6 rounded-full border border-[var(--flux-control-border)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text-muted)] flex items-center justify-center text-[11px] hover:border-[var(--flux-primary)] hover:text-[var(--flux-primary-light)] hover:bg-[var(--flux-primary-glow)]"
              aria-label={t("column.tooltips.newCard")}
            >
              +
            </button>
          </CustomTooltip>
          {onRenameColumn && (
            <CustomTooltip content={t("column.tooltips.renameColumn")} position="top">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRenameColumn();
                }}
                className="w-6 h-6 rounded-full border border-[var(--flux-control-border)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text-muted)] flex items-center justify-center text-[11px] hover:border-[var(--flux-primary)] hover:text-[var(--flux-primary-light)] hover:bg-[var(--flux-primary-glow)]"
                aria-label={t("column.tooltips.renameColumn")}
              >
                ✎
              </button>
            </CustomTooltip>
          )}
          <CustomTooltip content={collapsed ? t("column.tooltips.expandColumn") : t("column.tooltips.collapseColumn")} position="top">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleCollapse();
              }}
              className="w-6 h-6 rounded-full border border-[var(--flux-control-border)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text-muted)] flex items-center justify-center text-xs hover:border-[var(--flux-primary)] hover:text-[var(--flux-primary-light)] hover:bg-[var(--flux-primary-glow)]"
              aria-label={collapsed ? t("column.tooltips.expandColumn") : t("column.tooltips.collapseColumn")}
            >
              ◂
            </button>
          </CustomTooltip>
          {onDeleteColumn && (
            <CustomTooltip content={t("column.tooltips.deleteColumn")} position="top">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteColumn();
                }}
                className="w-6 h-6 rounded-full border border-[var(--flux-control-border)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text-muted)] flex items-center justify-center text-[11px] hover:border-[var(--flux-danger)] hover:text-[var(--flux-danger)] hover:bg-[rgba(255,107,107,0.08)]"
                aria-label={t("column.tooltips.deleteColumn")}
              >
                ×
              </button>
            </CustomTooltip>
          )}
        </div>
      </div>

        <div
          ref={setBucketRef}
          role="region"
          aria-label={t("column.dropRegionAriaLabel", { label: bucket.label })}
          className="p-2.5 flex-1 overflow-y-auto flex flex-col gap-1.5 min-h-[50px] scrollbar-kanban"
        >
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
        </>
      )}
    </div>
  );
}

