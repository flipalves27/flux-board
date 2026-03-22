"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { useBoardStore } from "@/stores/board-store";
import { useOptionalBoardCardSelection } from "./board-card-selection-context";
import { CustomTooltip } from "@/components/ui/custom-tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { BucketConfig } from "@/app/board/[id]/page";
import { useTranslations } from "next-intl";
import { computeCardRiskScore, inferStagnationDaysFromCard } from "@/lib/card-risk-score";

type SubtaskItem = { id: string; status: "pending" | "in_progress" | "done" | "blocked" };

function RiskScoreBadge({ score }: { score: number }) {
  const color =
    score <= 40
      ? "var(--flux-success)"
      : score <= 70
        ? "var(--flux-warning)"
        : "var(--flux-danger)";
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

function SubtaskProgressMini({ subtasks }: { subtasks: SubtaskItem[] }) {
  if (!subtasks.length) return null;
  const done = subtasks.filter((s) => s.status === "done").length;
  const blocked = subtasks.filter((s) => s.status === "blocked").length;
  const inProgress = subtasks.filter((s) => s.status === "in_progress").length;
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

interface KanbanCardProps {
  cardId: string;
  /** Coluna atual (lista visível) — seleção com Shift. */
  bucketKey: string;
  directions: string[];
  dirColors: Record<string, string>;
  onEdit: (cardId: string) => void;
  onDelete: (cardId: string) => void;
  onSetDirection: (cardId: string, dir: string) => void;
  onOpenDesc?: (cardId: string) => void;
  isDragging?: boolean;
  tourFirstCard?: boolean;
  /** Colunas do board — mover card sem modal. */
  buckets?: BucketConfig[];
  priorities?: string[];
  onPatchCard?: (
    cardId: string,
    patch: Partial<{ priority: string; bucket: string }>
  ) => void;
  onDuplicateCard?: (cardId: string) => void;
  /** Desativa a barra (ex.: preview no DragOverlay). */
  quickActionsDisabled?: boolean;
  /** Preview no DragOverlay — não registra segundo draggable. */
  dragOverlayPreview?: boolean;
  /** IDs do arrasto em curso (opacidade nos cards de origem). */
  activeDragIds?: string[] | null;
}

/** Compara apenas datas de calendário em UTC — evita divergência SSR (Node UTC) vs browser (fuso local). */
function daysRemaining(dueDate: string | null): number | null {
  if (!dueDate) return null;
  const trimmed = dueDate.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  const dueUtc = Date.UTC(y, mo - 1, d);
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((dueUtc - todayUtc) / 86400000);
}

const LONG_PRESS_MS = 450;
const HOVER_SHOW_MS = 200;
const MOVE_CANCEL_PX = 10;

function KanbanCardInner({
  cardId,
  bucketKey,
  directions,
  dirColors: _dirColors,
  onEdit,
  onDelete,
  onSetDirection,
  onOpenDesc,
  isDragging = false,
  tourFirstCard,
  buckets = [],
  priorities = [],
  onPatchCard,
  onDuplicateCard,
  quickActionsDisabled = false,
  dragOverlayPreview = false,
  activeDragIds = null,
}: KanbanCardProps) {
  const card = useBoardStore((s) => s.db?.cards.find((c) => c.id === cardId));
  const selection = useOptionalBoardCardSelection();
  const dragIds =
    dragOverlayPreview || !selection ? [cardId] : selection.getOrderedDragIds(cardId);
  const selected = selection?.isSelected(cardId) ?? false;
  const selectionCount = selection?.selectedIds.size ?? 0;
  const isGhostSource = Boolean(activeDragIds?.includes(cardId));

  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `card-${cardId}`,
    disabled: dragOverlayPreview,
    data: card ? { card, bucket: card.bucket, dragIds } : { card: null, bucket: "", dragIds: [cardId] },
  });

  const t = useTranslations("kanban");
  const cardRef = useRef<HTMLDivElement | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const prioMenuOpenRef = useRef(false);
  const colMenuOpenRef = useRef(false);

  const [showToolbar, setShowToolbar] = useState(false);
  const [touchPinned, setTouchPinned] = useState(false);
  /** Relógio/risco só após mount — evita hidratação #418 (SSR ≠ cliente). */
  const [datesReady, setDatesReady] = useState(false);
  useEffect(() => {
    setDatesReady(true);
  }, []);

  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  const clearLeaveTimer = useCallback(() => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  }, []);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const tryHideToolbarAfterMenu = useCallback(() => {
    requestAnimationFrame(() => {
      if (!cardRef.current?.matches(":hover")) {
        setShowToolbar(false);
      }
    });
  }, []);

  const onPrioMenuOpenChange = useCallback(
    (open: boolean) => {
      prioMenuOpenRef.current = open;
      if (!open && !colMenuOpenRef.current) tryHideToolbarAfterMenu();
    },
    [tryHideToolbarAfterMenu]
  );

  const onColMenuOpenChange = useCallback(
    (open: boolean) => {
      colMenuOpenRef.current = open;
      if (!open && !prioMenuOpenRef.current) tryHideToolbarAfterMenu();
    },
    [tryHideToolbarAfterMenu]
  );

  useEffect(() => {
    if (isDragging || quickActionsDisabled) {
      setShowToolbar(false);
      setTouchPinned(false);
    }
  }, [isDragging, quickActionsDisabled]);

  useEffect(() => {
    if (!touchPinned) return;
    const onDocPointerDown = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el) return;
      if (el.closest('[role="menu"]')) return;
      if (cardRef.current?.contains(el)) return;
      setTouchPinned(false);
      setShowToolbar(false);
    };
    document.addEventListener("pointerdown", onDocPointerDown, true);
    return () => document.removeEventListener("pointerdown", onDocPointerDown, true);
  }, [touchPinned]);

  const handleMouseEnter = useCallback(() => {
    if (isDragging || quickActionsDisabled) return;
    clearLeaveTimer();
    clearHoverTimer();
    hoverTimerRef.current = setTimeout(() => setShowToolbar(true), HOVER_SHOW_MS);
  }, [clearHoverTimer, clearLeaveTimer, isDragging, quickActionsDisabled]);

  const handleMouseLeave = useCallback(() => {
    clearHoverTimer();
    clearLeaveTimer();
    leaveTimerRef.current = setTimeout(() => {
      if (!prioMenuOpenRef.current && !colMenuOpenRef.current) {
        setShowToolbar(false);
      }
    }, 150);
  }, [clearHoverTimer, clearLeaveTimer]);

  const onCardPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType !== "touch") return;
      touchStartRef.current = { x: e.clientX, y: e.clientY };
      clearLongPress();
      if (isDragging || quickActionsDisabled) return;
      longPressTimerRef.current = setTimeout(() => {
        setTouchPinned(true);
        setShowToolbar(true);
      }, LONG_PRESS_MS);
    },
    [clearLongPress, isDragging, quickActionsDisabled]
  );

  const onCardPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType !== "touch" || !touchStartRef.current) return;
      const dx = Math.abs(e.clientX - touchStartRef.current.x);
      const dy = Math.abs(e.clientY - touchStartRef.current.y);
      if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) {
        clearLongPress();
        touchStartRef.current = null;
      }
    },
    [clearLongPress]
  );

  const endTouchTrack = useCallback(() => {
    clearLongPress();
    touchStartRef.current = null;
  }, [clearLongPress]);

  const handleEdit = useCallback(() => onEdit(cardId), [cardId, onEdit]);
  const handleDelete = useCallback(() => onDelete(cardId), [cardId, onDelete]);
  const handleOpenDesc = useCallback(() => onOpenDesc?.(cardId), [cardId, onOpenDesc]);
  const handleSetDir = useCallback((dir: string) => onSetDirection(cardId, dir), [cardId, onSetDirection]);

  const handleCardClick = useCallback(
    (e: React.MouseEvent) => {
      const el = e.target as HTMLElement;
      if (
        el.closest(".dir-btn") ||
        el.closest(".card-quick-actions") ||
        el.closest('[role="menu"]') ||
        el.closest('[role="menuitem"]')
      ) {
        return;
      }
      if (selection) {
        if (e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          selection.onShiftClick(cardId, bucketKey);
          return;
        }
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          e.stopPropagation();
          selection.onCtrlClick(cardId, bucketKey);
          return;
        }
        selection.clearSelection();
      }
      handleEdit();
    },
    [bucketKey, cardId, handleEdit, selection]
  );

  const stopDrag = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
  }, []);

  if (!card) return null;

  const dr = datesReady ? daysRemaining(card.dueDate) : null;
  const prioLabel = t(`cardModal.options.priority.${card.priority}`);
  const progLabel = t(`cardModal.options.progress.${card.progress}`);

  const nowMs = datesReady ? Date.now() : 0;
  const cardRaw = card as unknown as Record<string, unknown>;
  const stagnDays = datesReady ? inferStagnationDaysFromCard(cardRaw, nowMs) : 0;
  const riskScore = datesReady
    ? computeCardRiskScore(cardRaw, {
        columnStagnationDays: stagnDays,
        daysUntilDue: dr,
        blockedHint: Array.isArray(card.blockedBy) && (card.blockedBy as string[]).length > 0,
      })
    : 0;

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
      ? "bg-[var(--flux-danger-alpha-15)] text-[var(--flux-danger)] border border-[var(--flux-danger-alpha-35)]"
      : card.priority === "Importante"
        ? "bg-[var(--flux-warning-alpha-12)] text-[var(--flux-warning)] border border-[var(--flux-warning-alpha-35)]"
        : "bg-[var(--flux-info-alpha-12)] text-[var(--flux-info)] border border-[var(--flux-info-alpha-35)]";

  const progColor =
    card.progress === "Em andamento"
      ? "var(--flux-primary)"
      : card.progress === "Concluída"
        ? "var(--flux-success)"
        : "var(--flux-text-muted)";

  const hasQuick =
    Boolean(onPatchCard) &&
    Boolean(onDuplicateCard) &&
    priorities.length > 0 &&
    buckets.length > 0 &&
    !quickActionsDisabled;

  const toolbarOn = hasQuick && !isDragging && (showToolbar || touchPinned);

  const dragVisual = isDragging || isGhostSource;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      data-tour={tourFirstCard ? "board-card" : undefined}
      aria-label={ariaLabel}
      data-selected={selected ? "true" : undefined}
      className={`relative bg-[var(--flux-surface-elevated)] border rounded-xl p-3.5 cursor-grab active:cursor-grabbing transition-all duration-200 ease-out shadow-[inset_0_1px_0_var(--flux-border-muted)] hover:shadow-[0_6px_24px_var(--flux-primary-alpha-18)] ${
        selected
          ? "border-[var(--flux-primary)] ring-2 ring-[var(--flux-primary)]/55 bg-[var(--flux-primary-alpha-08)] hover:border-[var(--flux-primary)]"
          : "border-[var(--flux-border-default)] hover:border-[var(--flux-primary)]/50"
      } ${dragVisual ? "opacity-40 scale-[0.98]" : ""}`}
    >
      {selected && selectionCount > 1 ? (
        <span
          className="absolute -top-2 -right-2 z-10 min-w-[22px] h-[22px] px-1 rounded-full bg-[var(--flux-primary)] text-white text-[11px] font-bold flex items-center justify-center tabular-nums shadow-md pointer-events-none"
          aria-hidden
        >
          {selectionCount}
        </span>
      ) : null}
      {riskScore > 40 && card.progress !== "Concluída" && (
        <RiskScoreBadge score={riskScore} />
      )}
      <div
        ref={cardRef}
        className="relative flex flex-col min-w-0"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onPointerDown={onCardPointerDown}
        onPointerMove={onCardPointerMove}
        onPointerUp={endTouchTrack}
        onPointerCancel={endTouchTrack}
        onClick={handleCardClick}
      >
        <div
          className={`card-quick-actions flex flex-wrap items-center gap-1 transition-all duration-200 ease-out overflow-hidden border-b border-transparent ${
            toolbarOn
              ? "max-h-14 opacity-100 py-1.5 mb-1.5 -mx-1 px-1 border-[var(--flux-border-muted)] bg-[var(--flux-surface-hover)]/80 rounded-lg"
              : "max-h-0 opacity-0 py-0 mb-0 pointer-events-none"
          }`}
          onPointerDown={stopDrag}
          onClick={stopDrag}
          aria-hidden={!toolbarOn}
        >
          {hasQuick && toolbarOn ? (
            <>
              <DropdownMenu modal={false} onOpenChange={onPrioMenuOpenChange}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="h-6 min-w-0 max-w-[104px] shrink px-1.5 rounded-md border border-[var(--flux-control-border)] bg-[var(--flux-surface-card)] text-[10px] font-semibold text-[var(--flux-text)] flex items-center gap-0.5 hover:border-[var(--flux-primary)]"
                    title={t("card.quickActions.priorityTooltip")}
                    aria-label={t("card.quickActions.priorityTooltip")}
                  >
                    <span className="truncate">{prioLabel}</span>
                    <span className="text-[var(--flux-text-muted)] opacity-80">▾</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[140px]">
                  {priorities.map((p) => (
                    <DropdownMenuItem
                      key={p}
                      disabled={p === card.priority}
                      onSelect={() => {
                        onPatchCard?.(cardId, { priority: p });
                        setTouchPinned(false);
                      }}
                    >
                      {t(`cardModal.options.priority.${p}`)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu modal={false} onOpenChange={onColMenuOpenChange}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="h-6 min-w-0 max-w-[120px] shrink px-1.5 rounded-md border border-[var(--flux-control-border)] bg-[var(--flux-surface-card)] text-[10px] font-semibold text-[var(--flux-text)] flex items-center gap-0.5 hover:border-[var(--flux-primary)]"
                    title={t("card.quickActions.moveTooltip")}
                    aria-label={t("card.quickActions.moveTooltip")}
                  >
                    <span className="truncate">
                      {buckets.find((b) => b.key === card.bucket)?.label ?? card.bucket}
                    </span>
                    <span className="text-[var(--flux-text-muted)] opacity-80">▾</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[160px] max-h-[min(280px,50vh)] overflow-y-auto scrollbar-kanban">
                  {buckets.map((b) => (
                    <DropdownMenuItem
                      key={b.key}
                      disabled={b.key === card.bucket}
                      onSelect={() => {
                        onPatchCard?.(cardId, { bucket: b.key });
                        setTouchPinned(false);
                      }}
                    >
                      {b.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <CustomTooltip content={t("card.quickActions.duplicateTooltip")} position="top">
                <button
                  type="button"
                  className="h-6 w-6 shrink-0 rounded-md border border-[var(--flux-control-border)] bg-[var(--flux-surface-card)] text-[var(--flux-text-muted)] flex items-center justify-center hover:border-[var(--flux-primary)] hover:text-[var(--flux-primary-light)]"
                  aria-label={t("card.quickActions.duplicateTooltip")}
                  onClick={() => {
                    onDuplicateCard?.(cardId);
                    setTouchPinned(false);
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5" aria-hidden>
                    <rect x="8" y="8" width="12" height="12" rx="2" />
                    <path d="M4 16V6a2 2 0 0 1 2-2h10" />
                  </svg>
                </button>
              </CustomTooltip>

              <CustomTooltip content={t("card.quickActions.deleteTooltip")} position="top">
                <button
                  type="button"
                  className="h-6 w-6 shrink-0 rounded-md border border-[var(--flux-control-border)] bg-[var(--flux-surface-card)] text-[var(--flux-danger)] flex items-center justify-center hover:bg-[var(--flux-danger-alpha-15)] hover:border-[var(--flux-danger)]"
                  aria-label={t("card.quickActions.deleteTooltip")}
                  onClick={() => {
                    handleDelete();
                    setTouchPinned(false);
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5" aria-hidden>
                    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14zM10 11v6M14 11v6" />
                  </svg>
                </button>
              </CustomTooltip>
            </>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2 mb-1.5 card-top">
          <div className="flex items-center gap-1 card-id-wrap">
            <span className="text-[11px] font-bold text-[var(--flux-text-muted)] font-mono card-id">{card.id}</span>

            {onOpenDesc && (
              <CustomTooltip content={t("card.tooltips.description")} position="top">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenDesc();
                  }}
                  className="card-desc-btn w-[22px] h-[22px] rounded-md border border-[var(--flux-control-border)] bg-[var(--flux-surface-card)] text-[var(--flux-text-muted)] flex items-center justify-center shrink-0 hover:bg-[var(--flux-primary)] hover:text-white hover:border-[var(--flux-primary)] transition-all duration-200 [&_svg]:w-3 [&_svg]:h-3 [&_svg]:stroke-[2.5]"
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
              className="rounded border border-[var(--flux-control-border)] px-1 py-0 text-[10px] text-[var(--flux-text-muted)] hover:border-[var(--flux-primary)] hover:text-[var(--flux-primary-light)]"
              title={t("card.tooltips.copyCardId")}
              aria-label={t("card.tooltips.copyCardId")}
            >
              {t("card.actions.copy")}
            </button>
          </div>

          <div className="flex items-center gap-1 card-top-right">
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
          {card.tags.map((tag) => (
            <span
              key={tag}
              className={`text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-[var(--flux-surface-hover)] text-[var(--flux-text-muted)] ${
                tag === "Incidente" ? "bg-[var(--flux-accent-alpha-15)] text-[var(--flux-accent)] border border-[var(--flux-accent-alpha-35)] font-semibold" : ""
              }`}
            >
              {tag}
            </span>
          ))}
        </div>
        {Array.isArray(card.docRefs) && card.docRefs.length > 0 && (
          <div className="mb-2 text-[11px] text-[var(--flux-primary-light)]">
            {card.docRefs.length} doc(s) vinculado(s)
          </div>
        )}
        {Array.isArray((card as unknown as Record<string, unknown>).subtasks) && ((card as unknown as Record<string, unknown>).subtasks as unknown[]).length > 0 && (
          <SubtaskProgressMini subtasks={(card as unknown as Record<string, unknown>).subtasks as SubtaskItem[]} />
        )}
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: progColor }} />
            <span className="text-[11px] text-[var(--flux-text-muted)] font-medium">{progLabel}</span>
          </div>
          {dr !== null && (
            <span className={`flex items-center gap-1 text-[11px] font-semibold ${dueClass}`}>
              <span>◷</span>
              {dueText}
            </span>
          )}
        </div>
        <div className="border-t border-[var(--flux-border-muted)] pt-2.5 mt-2">
          <span className="text-[11px] font-semibold text-[var(--flux-text-muted)] uppercase block mb-2 font-display">
            {t("card.direction.heading")}
          </span>
          <div className="flex gap-2 flex-wrap">
            {directions.map((d) => {
              const dk = d.toLowerCase();
              const sel = card.direction === dk;
              const dirLabel = (() => {
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
                      ? `text-white ${dk === "manter" ? "bg-[var(--flux-success-solid-dark)] border-[var(--flux-success-solid-dark)]" : dk === "priorizar" ? "bg-[var(--flux-secondary)] border-[var(--flux-secondary)]" : dk === "adiar" ? "bg-[var(--flux-warning)] border-[var(--flux-warning)] text-[var(--flux-ink-on-bright)]" : dk === "cancelar" ? "bg-[var(--flux-danger)] border-[var(--flux-danger)]" : "bg-[var(--flux-text-muted)] border-[var(--flux-text-muted)]"}`
                      : "bg-[var(--flux-surface-card)] text-[var(--flux-text-muted)] border-[var(--flux-control-border)] hover:border-[var(--flux-primary)] hover:text-[var(--flux-primary-light)] hover:bg-[var(--flux-primary-glow)]"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSetDir(dk);
                  }}
                >
                  {dirLabel}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export const KanbanCard = memo(KanbanCardInner);
