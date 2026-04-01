"use client";

import { useEffect, useRef, type ComponentProps, type RefObject } from "react";
import { DndContext, DragOverlay, type CollisionDetection, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import type { BucketConfig, CardData } from "@/app/board/[id]/page";
import type { CardTemplate } from "@/lib/kv-card-templates";
import type { BoardViewMode } from "./kanban-constants";
import { KanbanColumn } from "./kanban-column";
import { KanbanCard } from "./kanban-card";
import { BoardTimelineView } from "./board-timeline-view";
import { BoardTableView } from "./board-table-view";
import { CustomTooltip } from "@/components/ui/custom-tooltip";
import { DIR_COLORS } from "./kanban-constants";
import { parseSlotId } from "./kanban-dnd-utils";

type KanbanBoardCanvasProps = {
  t: (key: string, values?: Record<string, string | number>) => string;
  boardScrollRef: RefObject<HTMLDivElement | null>;
  boardView: BoardViewMode;
  isPanning: boolean;
  onPanPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPanPointerMove?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPanPointerUp?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPanPointerCancel?: (e: React.PointerEvent<HTMLDivElement>) => void;
  cards: CardData[];
  buckets: BucketConfig[];
  collapsed: Set<string>;
  directions: string[];
  filterCard: (c: CardData) => boolean;
  visibleCardsByBucket: (key: string) => CardData[];
  onTimelineDueDate: (cardId: string, nextDue: string) => void;
  onTimelineOpenCard: (card: CardData) => void;
  priorities: string[];
  onPatchCardFromTable: (
    cardId: string,
    patch: Partial<Pick<CardData, "title" | "priority" | "dueDate" | "bucket" | "tags">>
  ) => void;
  onTableOpenCard: (card: CardData) => void;
  sensors: NonNullable<ComponentProps<typeof DndContext>["sensors"]>;
  collisionDetection: CollisionDetection;
  onDragStart: (e: DragStartEvent) => void;
  onDragEnd: (e: DragEndEvent) => void;
  activeCard: CardData | null | undefined;
  activeDragCount: number;
  activeDragIds: string[] | null;
  onToggleCollapse: (key: string) => void;
  onAddCard: (bucketKey: string) => void;
  onEditCard: (cardId: string) => void;
  onDeleteCard: (id: string) => void;
  onRenameColumn: (b: BucketConfig) => void;
  onDeleteColumn: ((key: string) => void) | undefined;
  onSetDirection: (cardId: string, dir: string) => void;
  onOpenDesc: (cardId: string) => void;
  onOpenAddColumn: () => void;
  onPatchCard: (
    cardId: string,
    patch: Partial<Pick<CardData, "priority" | "bucket">>
  ) => void;
  onDuplicateCard: (cardId: string) => void;
  onPinCardToTop?: (cardId: string) => void;
  /** Coluna com maior visibilidade no scroll (presença em tempo real). */
  onVisibleColumnKeyChange?: (columnKey: string | null) => void;
  /** Incluir/remover card de sprint a partir do menu do card (usa sprint-store + API). */
  sprintBoardQuickActions?: { boardId: string; getHeaders: () => Record<string, string> };
  onAddCardFromTemplate?: (bucketKey: string, template: CardTemplate) => void;
  getHeaders?: () => Record<string, string>;
  doneBucketKeys?: string[];
  historicalCycleDays?: number[];
};

function bucketToEisenhowerKey(bucket: string): "do_first" | "schedule" | "delegate" | "eliminate" | null {
  if (bucket === "do_first" || bucket === "schedule" || bucket === "delegate" || bucket === "eliminate") return bucket;
  const b = bucket.toLowerCase();
  if (b.includes("urgente") && b.includes("importante")) return "do_first";
  if (b.includes("importante")) return "schedule";
  if (b.includes("urgente")) return "delegate";
  return null;
}

export function KanbanBoardCanvas({
  t,
  boardScrollRef,
  boardView,
  isPanning,
  onPanPointerDown,
  onPanPointerMove,
  onPanPointerUp,
  onPanPointerCancel,
  cards,
  buckets,
  collapsed,
  directions,
  filterCard,
  visibleCardsByBucket,
  onTimelineDueDate,
  onTimelineOpenCard,
  priorities,
  onPatchCardFromTable,
  onTableOpenCard,
  sensors,
  collisionDetection,
  onDragStart,
  onDragEnd,
  activeCard,
  activeDragCount,
  activeDragIds,
  onToggleCollapse,
  onAddCard,
  onEditCard,
  onDeleteCard,
  onRenameColumn,
  onDeleteColumn,
  onSetDirection,
  onOpenDesc,
  onOpenAddColumn,
  onPatchCard,
  onDuplicateCard,
  onPinCardToTop,
  onVisibleColumnKeyChange,
  sprintBoardQuickActions,
  onAddCardFromTemplate,
  getHeaders,
  doneBucketKeys = [],
  historicalCycleDays,
}: KanbanBoardCanvasProps) {
  /** Assinatura estável — evita re-montar o observer quando `buckets` só muda de referência. */
  const bucketKeysSig = buckets.map((b) => b.key).join("|");
  const lastReportedVisibleKeyRef = useRef<string | null>(null);
  const visibleColDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingVisibleKeyRef = useRef<string | null>(null);

  useEffect(() => {
    lastReportedVisibleKeyRef.current = null;
    if (boardView !== "kanban" || !onVisibleColumnKeyChange) return;
    const root = boardScrollRef.current;
    if (!root) return;

    let cancelled = false;
    let io: IntersectionObserver | null = null;
    const raf = requestAnimationFrame(() => {
      if (cancelled) return;
      const cols = root.querySelectorAll<HTMLElement>("[data-flux-column-key]");
      if (!cols.length) return;
      io = new IntersectionObserver(
        (entries) => {
          let best: { key: string; ratio: number } | null = null;
          for (const e of entries) {
            const key = e.target.getAttribute("data-flux-column-key");
            if (!key) continue;
            if (!best || e.intersectionRatio > best.ratio) best = { key, ratio: e.intersectionRatio };
          }
          if (best && best.ratio > 0.04) {
            const next = best.key;
            pendingVisibleKeyRef.current = next;
            if (visibleColDebounceRef.current) clearTimeout(visibleColDebounceRef.current);
            visibleColDebounceRef.current = setTimeout(() => {
              visibleColDebounceRef.current = null;
              const k = pendingVisibleKeyRef.current;
              if (k == null) return;
              if (lastReportedVisibleKeyRef.current !== k) {
                lastReportedVisibleKeyRef.current = k;
                onVisibleColumnKeyChange(k);
              }
            }, 80);
          }
        },
        { root, rootMargin: "0px", threshold: [0, 0.05, 0.15, 0.35, 0.55, 0.75, 1] }
      );
      cols.forEach((c) => io?.observe(c));
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (visibleColDebounceRef.current) {
        clearTimeout(visibleColDebounceRef.current);
        visibleColDebounceRef.current = null;
      }
      io?.disconnect();
    };
  }, [boardScrollRef, boardView, bucketKeysSig, onVisibleColumnKeyChange]);

  return (
    <div
      ref={boardScrollRef}
      onPointerDown={boardView === "kanban" ? onPanPointerDown : undefined}
      onPointerMove={boardView === "kanban" ? onPanPointerMove : undefined}
      onPointerUp={boardView === "kanban" ? onPanPointerUp : undefined}
      onPointerCancel={boardView === "kanban" ? onPanPointerCancel : undefined}
      className={`board-canvas w-full px-3 sm:px-6 lg:px-8 py-3 sm:py-4 pb-4 sm:pb-6 scrollbar-flux transition-[min-height] duration-300 ease-in-out relative z-[var(--flux-z-board-canvas)] ${
        boardView === "kanban"
          ? `flex gap-3 sm:gap-4 overflow-x-auto overflow-y-hidden items-stretch ${isPanning ? "cursor-grabbing select-none" : "cursor-default"}`
          : "flex flex-col overflow-x-hidden"
      } min-h-[min(85dvh,calc(100dvh-260px))] sm:min-h-[calc(100vh-240px)]`}
      style={{
        touchAction:
          boardView === "kanban" ? (isPanning ? "none" : "pan-x pan-y") : undefined,
        WebkitOverflowScrolling: boardView === "kanban" ? "touch" : undefined,
      }}
    >
      {boardView === "timeline" ? (
        <BoardTimelineView
          cards={cards}
          buckets={buckets}
          prioritiesOrder={priorities}
          filterCard={filterCard}
          onChangeDueDate={onTimelineDueDate}
          onOpenCard={onTimelineOpenCard}
        />
      ) : null}
      {boardView === "table" ? (
        <BoardTableView
          cards={cards}
          buckets={buckets}
          filterCard={filterCard}
          priorities={priorities}
          onPatchCard={onPatchCardFromTable}
          onOpenCard={onTableOpenCard}
        />
      ) : null}
      {boardView === "eisenhower" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(
            [
              { key: "do_first", label: "Do first" },
              { key: "schedule", label: "Schedule" },
              { key: "delegate", label: "Delegate" },
              { key: "eliminate", label: "Delete" },
            ] as const
          ).map((q) => {
            const items = cards.filter((c) => {
              if (!filterCard(c)) return false;
              const key = bucketToEisenhowerKey(c.bucket);
              return key === q.key;
            });
            return (
              <section key={q.key} className="rounded-[var(--flux-rad-lg)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] p-3">
                <h3 className="text-sm font-semibold text-[var(--flux-text)] mb-2">{q.label}</h3>
                <div className="space-y-2">
                  {items.length === 0 ? (
                    <p className="text-xs text-[var(--flux-text-muted)]">Sem cards.</p>
                  ) : (
                    items.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full text-left rounded-md border border-[var(--flux-control-border)] px-2 py-1.5 text-xs hover:border-[var(--flux-primary-alpha-35)]"
                        onClick={() => onEditCard(c.id)}
                      >
                        <div className="font-medium truncate">{c.title}</div>
                        <div className="text-[10px] text-[var(--flux-text-muted)] truncate">{c.id}</div>
                      </button>
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : null}
      {boardView === "kanban" ? (
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          accessibility={{
            screenReaderInstructions: {
              draggable: t("board.dnd.screenReaderInstructions.draggable"),
            },
            announcements: {
              onDragStart: ({ active }) => {
                const aid = String(active.id);
                if (aid.startsWith("card-")) {
                  const cardId = aid.replace("card-", "");
                  const card = cards.find((c) => c.id === cardId);
                  const raw = active.data.current as { dragIds?: string[] } | undefined;
                  const n = raw?.dragIds?.length ?? 1;
                  if (n > 1) {
                    return t("board.dnd.announcements.dragStart.multiCard", { count: n });
                  }
                  return card
                    ? t("board.dnd.announcements.dragStart.cardWithTitle", { cardTitle: card.title })
                    : t("board.dnd.announcements.dragStart.card");
                }
                const col = buckets.find((b) => b.key === aid);
                return col
                  ? t("board.dnd.announcements.dragStart.columnWithTitle", { columnLabel: col.label })
                  : t("board.dnd.announcements.dragStart.column");
              },
              onDragOver: ({ over }) => {
                if (!over) return;
                const overId = String(over.id);
                if (overId.startsWith("bucket-")) {
                  const bucketKey = overId.replace("bucket-", "");
                  const col = buckets.find((b) => b.key === bucketKey);
                  return col
                    ? t("board.dnd.announcements.dragOver.dropOnColumnWithTitle", { columnLabel: col.label })
                    : t("board.dnd.announcements.dragOver.dropOnColumn");
                }
                const slotInfo = parseSlotId(overId);
                if (slotInfo) {
                  const col = buckets.find((b) => b.key === slotInfo.bucketKey);
                  const pos = slotInfo.index + 1;
                  return col
                    ? t("board.dnd.announcements.dragOver.dropOnColumnWithPosition", {
                        columnLabel: col.label,
                        pos,
                      })
                    : t("board.dnd.announcements.dragOver.dropOnPositionOnly", { pos });
                }
                return;
              },
              onDragEnd: ({ over }) => {
                if (!over) return;
                const overId = String(over.id);
                if (overId.startsWith("bucket-")) return t("board.dnd.announcements.dragEnd.dropped");
                const slotInfo = parseSlotId(overId);
                if (slotInfo) return t("board.dnd.announcements.dragEnd.dropped");
                return t("board.dnd.announcements.dragEnd.dropped");
              },
              onDragCancel: () => t("board.dnd.announcements.dragCancel"),
            },
          }}
        >
          <SortableContext items={buckets.map((b) => b.key)} strategy={horizontalListSortingStrategy}>
            {buckets.map((b, colIdx) => (
              <KanbanColumn
                key={b.key}
                bucket={b}
                cards={visibleCardsByBucket(b.key)}
                collapsed={collapsed.has(b.key)}
                onToggleCollapse={() => onToggleCollapse(b.key)}
                onAddCard={() => onAddCard(b.key)}
                onEditCard={onEditCard}
                onDeleteCard={onDeleteCard}
                onRenameColumn={() => onRenameColumn(b)}
                onDeleteColumn={buckets.length > 1 && onDeleteColumn ? () => onDeleteColumn(b.key) : undefined}
                onSetDirection={(cardId, dir) => onSetDirection(cardId, dir)}
                onOpenDesc={onOpenDesc}
                directions={directions}
                dirColors={DIR_COLORS}
                boardBuckets={buckets}
                priorities={priorities}
                onPatchCard={onPatchCard}
                onDuplicateCard={onDuplicateCard}
                isFirstColumn={colIdx === 0}
                activeDragIds={activeDragIds}
                sprintBoardQuickActions={sprintBoardQuickActions}
                onAddCardFromTemplate={onAddCardFromTemplate ? (tpl) => onAddCardFromTemplate(b.key, tpl) : undefined}
                getHeaders={getHeaders}
                doneBucketKeys={doneBucketKeys}
                historicalCycleDays={historicalCycleDays}
              />
            ))}
          </SortableContext>
          <CustomTooltip content={t("addColumnModal.title.new")} position="right">
            <button
              type="button"
              onClick={onOpenAddColumn}
              className="shrink-0 min-w-[44px] w-[44px] h-[80px] rounded-[var(--flux-rad)] border border-dashed border-[var(--flux-primary-alpha-30)] bg-[var(--flux-surface-card)] flex items-center justify-center text-[var(--flux-text-muted)] hover:border-[var(--flux-primary)] hover:text-[var(--flux-primary-light)] hover:bg-[var(--flux-primary-alpha-08)] transition-all cursor-pointer group opacity-80 hover:opacity-100"
              aria-label={t("addColumnModal.title.new")}
            >
              <span className="text-lg font-light group-hover:scale-110 transition-transform">+</span>
            </button>
          </CustomTooltip>

          <DragOverlay
            dropAnimation={{
              duration: 200,
              easing: "cubic-bezier(0.18, 0.67, 0.6, 1.02)",
            }}
          >
            {activeCard ? (
              <div className="relative scale-[1.02] shadow-[var(--flux-shadow-kanban-card-lift)] ring-2 ring-[var(--flux-primary)]/50 rounded-xl transition-all duration-200 ease-out">
                {activeDragCount > 1 ? (
                  <span className="absolute -top-2 -right-2 z-20 min-w-[28px] h-7 px-1.5 rounded-full bg-[var(--flux-primary)] text-white text-xs font-bold flex items-center justify-center tabular-nums shadow-lg pointer-events-none">
                    {t("batchSelection.draggingCount", { count: activeDragCount })}
                  </span>
                ) : null}
                <KanbanCard
                  cardId={activeCard.id}
                  bucketKey={activeCard.bucket}
                  directions={directions}
                  dirColors={DIR_COLORS}
                  onEdit={() => {}}
                  onDelete={() => {}}
                  onSetDirection={() => {}}
                  onOpenDesc={undefined}
                  isDragging
                  quickActionsDisabled
                  dragOverlayPreview
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : null}
    </div>
  );
}
