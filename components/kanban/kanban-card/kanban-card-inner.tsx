"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { useBoardStore } from "@/stores/board-store";
import { useSprintStore } from "@/stores/sprint-store";
import { apiFetch, getApiHeaders } from "@/lib/api-client";
import type { SprintData } from "@/lib/schemas";
import { useOptionalBoardCardSelection } from "../board-card-selection-context";
import { useTranslations } from "next-intl";
import { isSprintMethodology, type BoardMethodology } from "@/lib/board-methodology";
import { computeCardRiskScore, inferStagnationDaysFromCard } from "@/lib/card-risk-score";
import { predictDelivery } from "@/lib/predictive-delivery";
import type { KanbanCardProps } from "./kanban-card-props";
import { daysRemaining, HOVER_SHOW_MS, LONG_PRESS_MS, MOVE_CANCEL_PX } from "./kanban-card-utils";
import { kanbanCardVariantClass, resolveKanbanCardSurfaceVariant } from "./kanban-card-variants";
import { AiBlockedHintBadge, RiskScoreBadge } from "./kanban-card-badges";
import { KanbanCardToolbar } from "./kanban-card-toolbar";
import { KanbanCardBody } from "./kanban-card-body";
import { KanbanCardShell } from "./kanban-card-shell";
import { useCardSwipeActions } from "./use-card-swipe-actions";

const EMPTY_SPRINTS_LIST: SprintData[] = [];

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
  onPinToTop,
  quickActionsDisabled = false,
  dragOverlayPreview = false,
  activeDragIds = null,
  sprintBoardQuickActions,
  historicalCycleDays,
  isFinalColumn = false,
  isOpening = false,
}: KanbanCardProps) {
  const currentBoardId = useBoardStore((s) => s.boardId ?? "");
  const inActiveSprint = useSprintStore((s) => {
    const sp = s.activeSprint[currentBoardId];
    if (!sp || sp.status !== "active") return false;
    return (sp.cardIds ?? []).includes(cardId);
  });

  const activeSprintNameForCard = useSprintStore((s) => {
    const sp = s.activeSprint[currentBoardId];
    return sp?.status === "active" ? (sp.name?.trim() || "") : "";
  });

  const sprintsForBoard = useSprintStore((s) =>
    sprintBoardQuickActions ? (s.sprintsByBoard[sprintBoardQuickActions.boardId] ?? EMPTY_SPRINTS_LIST) : EMPTY_SPRINTS_LIST
  );

  const sprintMenuMeta = useMemo(() => {
    if (!sprintBoardQuickActions) return null;
    const planning = sprintsForBoard.filter((sp) => sp.status === "planning");
    const active = sprintsForBoard.find((sp) => sp.status === "active") ?? null;
    const containing = sprintsForBoard.filter(
      (sp) =>
        (sp.status === "planning" || sp.status === "active") && (sp.cardIds ?? []).includes(cardId)
    );
    const canAddSomewhere =
      planning.some((sp) => !(sp.cardIds ?? []).includes(cardId)) ||
      Boolean(active && !(active.cardIds ?? []).includes(cardId));
    const visible = containing.length > 0 || canAddSomewhere;
    return { planning, active, containing, visible };
  }, [sprintBoardQuickActions, sprintsForBoard, cardId]);

  const patchSprintCardIds = useCallback(
    async (sprintId: string, cardIds: string[]) => {
      if (!sprintBoardQuickActions) return;
      const { boardId, getHeaders } = sprintBoardQuickActions;
      const res = await apiFetch(`/api/boards/${encodeURIComponent(boardId)}/sprints/${encodeURIComponent(sprintId)}`, {
        method: "PATCH",
        headers: { ...getApiHeaders(getHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify({ cardIds }),
      });
      if (res.ok) {
        const data = (await res.json()) as { sprint: SprintData };
        useSprintStore.getState().upsertSprint(boardId, data.sprint);
      }
    },
    [sprintBoardQuickActions]
  );
  const card = useBoardStore((s) => s.db?.cards.find((c) => c.id === cardId));
  const boardMethodology = useBoardStore((s) => s.db?.boardMethodology ?? "scrum");
  const selection = useOptionalBoardCardSelection();
  const dragIds =
    dragOverlayPreview || !selection ? [cardId] : selection.getOrderedDragIds(cardId);
  const selected = selection?.isSelected(cardId) ?? false;
  const selectionCount = selection?.selectedIds.size ?? 0;
  const isGhostSource = Boolean(activeDragIds?.includes(cardId));

  const { attributes, listeners, setNodeRef: setDraggableRef } = useDraggable({
    id: `card-${cardId}`,
    disabled: dragOverlayPreview,
    data: card ? { card, bucket: card.bucket, dragIds } : { card: null, bucket: "", dragIds: [cardId] },
  });
  const { setNodeRef: setDroppableRef } = useDroppable({
    id: `card-${cardId}`,
    disabled: dragOverlayPreview,
  });

  const setNodeRef = useCallback(
    (node: HTMLElement | null) => {
      setDraggableRef(node);
      setDroppableRef(node);
    },
    [setDraggableRef, setDroppableRef]
  );

  const t = useTranslations("kanban");
  const cardRef = useRef<HTMLDivElement | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const prioMenuOpenRef = useRef(false);
  const colMenuOpenRef = useRef(false);
  const sprintMenuOpenRef = useRef(false);

  const [showToolbar, setShowToolbar] = useState(false);
  const [touchPinned, setTouchPinned] = useState(false);
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

  const onSprintMenuOpenChange = useCallback(
    (open: boolean) => {
      sprintMenuOpenRef.current = open;
      if (!open && !prioMenuOpenRef.current && !colMenuOpenRef.current) tryHideToolbarAfterMenu();
    },
    [tryHideToolbarAfterMenu]
  );

  const onPrioMenuOpenChange = useCallback(
    (open: boolean) => {
      prioMenuOpenRef.current = open;
      if (!open && !colMenuOpenRef.current && !sprintMenuOpenRef.current) tryHideToolbarAfterMenu();
    },
    [tryHideToolbarAfterMenu]
  );

  const onColMenuOpenChange = useCallback(
    (open: boolean) => {
      colMenuOpenRef.current = open;
      if (!open && !prioMenuOpenRef.current && !sprintMenuOpenRef.current) tryHideToolbarAfterMenu();
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
      if (!prioMenuOpenRef.current && !colMenuOpenRef.current && !sprintMenuOpenRef.current) {
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

  const swipe = useCardSwipeActions({
    onSwipeRight: () => handleOpenDesc(),
    onSwipeLeft: () => handleEdit(),
  });
  const handleSetDir = useCallback((dir: string) => onSetDirection(cardId, dir), [cardId, onSetDirection]);

  const handleCardClick = useCallback(
    (e: React.MouseEvent) => {
      const el = e.target as HTMLElement;
      if (
        el.closest(".dir-btn") ||
        el.closest(".card-quick-actions") ||
        el.closest(".card-complete-btn") ||
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

  const delivery = useMemo(() => {
    if (!card || isFinalColumn || !datesReady || !historicalCycleDays?.length) return null;
    return predictDelivery(
      { columnEnteredAt: card.columnEnteredAt, dueDate: card.dueDate, completedAt: card.completedAt },
      historicalCycleDays,
    );
  }, [card, isFinalColumn, datesReady, historicalCycleDays]);

  if (!card) return null;

  const dr = datesReady ? daysRemaining(card.dueDate) : null;
  const sc = card.serviceClass ?? null;
  const showExpedite = sc === "expedite" || (!sc && card.priority === "Urgente");
  const showDatebound = sc === "fixed_date" || (!sc && dr !== null && dr >= 0 && dr <= 3);
  const showIntangibleBadge = sc === "intangible";
  const showPrioritizeHeuristic =
    !sc && typeof card.direction === "string" && card.direction.toLowerCase() === "priorizar";
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

  const showPin = Boolean(onPinToTop) && !quickActionsDisabled;

  const showSprintQuick = Boolean(sprintMenuMeta?.visible) && !quickActionsDisabled;

  const showCompleteMove =
    Boolean(onPatchCard) && buckets.length > 0 && card.progress !== "Concluída" && !quickActionsDisabled;

  const toolbarOn = (hasQuick || showPin || showSprintQuick) && !isDragging && (showToolbar || touchPinned);

  const dragVisual = isDragging || isGhostSource;
  const sprintEmphasis = inActiveSprint && !selected;
  const sprintMethod = isSprintMethodology(boardMethodology as BoardMethodology);
  const sprintActiveChip =
    inActiveSprint && sprintMethod
      ? {
          label: t("board.sprintContext.cardChip"),
          title: t("board.sprintContext.cardChipAria", {
            name: activeSprintNameForCard || t("board.sprintContext.cardChip"),
          }),
        }
      : null;
  const sprintLeftAccent =
    sprintEmphasis && sprintMethod ? "shadow-[inset_3px_0_0_var(--flux-primary)]" : "";
  const matrixWeight = typeof card.matrixWeight === "number" ? Math.max(0, Math.min(100, Math.round(card.matrixWeight))) : null;

  const isBlocked = Array.isArray(card.blockedBy) && card.blockedBy.length > 0;
  const showAiBlockedHint = isBlocked && card.progress !== "Concluída";

  const dorObj = (card as unknown as Record<string, unknown>).dorReady as Record<string, boolean> | undefined;
  const hasSparseContent = !card.desc || card.desc === "Sem descrição." || card.desc.trim().length < 10;
  const dorIncomplete = !dorObj || !dorObj.titleOk || !dorObj.acceptanceOk || !dorObj.depsOk || !dorObj.sizedOk;
  const showAiRefineHint = card.progress !== "Concluída" && (hasSparseContent || dorIncomplete) && hasSparseContent;

  const progressDone = card.progress === "Concluída";
  const isBlockedOpen = isBlocked && !progressDone;
  const hasAiSurface =
    !progressDone && (showAiRefineHint || riskScore > 40);
  const surfaceVariant = resolveKanbanCardSurfaceVariant({
    progressDone,
    daysRemaining: dr,
    isBlockedOpen,
    hasAiSurface,
  });
  const variantClass = kanbanCardVariantClass(surfaceVariant);

  const rootClassName = `relative touch-manipulation flux-kanban-card border p-3.5 cursor-grab active:cursor-grabbing transition-all duration-200 ease-out hover:shadow-[0_8px_28px_var(--flux-primary-alpha-22)] ${
    selected
      ? "border-[var(--flux-primary)] ring-2 ring-[var(--flux-primary)]/55 bg-[var(--flux-primary-alpha-08)] hover:border-[var(--flux-primary)]"
      : sprintEmphasis
        ? "border-[var(--flux-primary-alpha-22)] ring-1 ring-[var(--flux-primary-alpha-22)] hover:border-[var(--flux-primary)]/50 shadow-[0_1px_10px_var(--flux-primary-alpha-12)]"
        : "border-[var(--flux-control-border)] hover:border-[var(--flux-primary)]/50"
  } ${sprintLeftAccent} ${isBlockedOpen ? "motion-safe:animate-[flux-ai-pulse_2.4s_ease-in-out_infinite]" : ""} ${dragVisual ? "opacity-40 scale-[0.98]" : ""} ${isOpening ? "flux-kanban-card--opening" : ""} ${variantClass}`.trim();

  const selectionOverlay =
    selected && selectionCount > 1 ? (
      <span
        className="absolute -top-2 -right-2 z-10 min-w-[22px] h-[22px] px-1 rounded-full bg-[var(--flux-primary)] text-white text-[11px] font-bold flex items-center justify-center tabular-nums shadow-md pointer-events-none"
        aria-hidden
      >
        {selectionCount}
      </span>
    ) : null;

  const topOverlayBadges = (
    <>
      {riskScore > 40 && card.progress !== "Concluída" && (
        <RiskScoreBadge score={riskScore} />
      )}
      {showAiBlockedHint && (
        <AiBlockedHintBadge tooltip={t("card.aiHints.unblockAssist")} />
      )}
    </>
  );

  return (
    <KanbanCardShell
      setNodeRef={setNodeRef}
      listeners={listeners}
      attributes={attributes}
      tourFirstCard={tourFirstCard}
      ariaLabel={ariaLabel}
      selected={selected}
      isOpening={isOpening}
      rootClassName={rootClassName}
      selectionOverlay={selectionOverlay}
      topOverlayBadges={topOverlayBadges}
    >
      <div
        ref={cardRef}
        className="relative flex flex-col min-w-0"
        onTouchStart={swipe.onTouchStart}
        onTouchEnd={swipe.onTouchEnd}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onPointerDown={onCardPointerDown}
        onPointerMove={onCardPointerMove}
        onPointerUp={endTouchTrack}
        onPointerCancel={endTouchTrack}
        onClick={handleCardClick}
      >
        <KanbanCardToolbar
          t={t}
          cardId={cardId}
          cardBucket={card.bucket}
          cardPriority={card.priority}
          prioLabel={prioLabel}
          buckets={buckets}
          priorities={priorities}
          toolbarOn={toolbarOn}
          stopDrag={stopDrag}
          onPatchCard={onPatchCard}
          onDuplicateCard={onDuplicateCard}
          onDelete={handleDelete}
          showPin={showPin}
          onPinToTop={onPinToTop}
          setTouchPinned={setTouchPinned}
          hasQuick={hasQuick}
          showSprintQuick={showSprintQuick}
          sprintMenuMeta={sprintMenuMeta}
          sprintBoardQuickActions={sprintBoardQuickActions ?? null}
          patchSprintCardIds={patchSprintCardIds}
          onSprintMenuOpenChange={onSprintMenuOpenChange}
          onPrioMenuOpenChange={onPrioMenuOpenChange}
          onColMenuOpenChange={onColMenuOpenChange}
        />
        <KanbanCardBody
          t={t}
          card={card}
          cardId={cardId}
          boardId={currentBoardId}
          directions={directions}
          boardMethodology={boardMethodology}
          prioLabel={prioLabel}
          progLabel={progLabel}
          prioClass={prioClass}
          progColor={progColor}
          dueClass={dueClass}
          dueText={dueText}
          dr={dr}
          matrixWeight={matrixWeight}
          showExpedite={showExpedite}
          showDatebound={showDatebound}
          showIntangibleBadge={showIntangibleBadge}
          showPrioritizeHeuristic={showPrioritizeHeuristic}
          showCompleteMove={showCompleteMove}
          showAiRefineHint={showAiRefineHint}
          buckets={buckets}
          onOpenDesc={onOpenDesc}
          onPatchCard={onPatchCard}
          handleOpenDesc={handleOpenDesc}
          handleSetDir={handleSetDir}
          stopDrag={stopDrag}
          setTouchPinned={setTouchPinned}
          delivery={delivery}
          sprintActiveChip={sprintActiveChip}
        />
      </div>
    </KanbanCardShell>
  );
}

export const KanbanCard = memo(KanbanCardInner);
