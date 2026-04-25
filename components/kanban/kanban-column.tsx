"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CardTemplatePicker } from "./card-template-picker";
import type { CardData, BucketConfig } from "@/app/board/[id]/page";
import type { CardTemplate } from "@/lib/kv-card-templates";
import { CustomTooltip } from "@/components/ui/custom-tooltip";
import { useTranslations } from "next-intl";
import { countColumnBlockedOpen, countColumnOverdueOpen } from "@/lib/kanban-column-flow";
import { KANBAN_COLUMN_CARD_CV_THRESHOLD } from "./kanban-constants";
import { KanbanColumnCardList } from "./kanban-column-card-list";

interface KanbanColumnProps {
  bucket: BucketConfig;
  cards: CardData[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  onAddCard: () => void;
  onEditCard: (cardId: string) => void;
  openingCardId?: string | null;
  onDeleteCard: (id: string) => void;
  onRenameColumn?: () => void;
  onDeleteColumn?: () => void;
  onSetDirection: (cardId: string, dir: string) => void;
  onOpenDesc?: (cardId: string) => void;
  directions: string[];
  dirColors: Record<string, string>;
  boardBuckets: BucketConfig[];
  priorities: string[];
  onPatchCard: (
    cardId: string,
    patch: Partial<Pick<CardData, "priority" | "bucket">>
  ) => void;
  onDuplicateCard: (cardId: string) => void;
  onPinCardToTop?: (cardId: string) => void;
  /** Primeira coluna do board (marcadores do tour guiado). */
  isFirstColumn?: boolean;
  /** Outro colaborador está a arrastar sobre esta coluna (indicador em tempo real). */
  remoteCollabHighlight?: boolean;
  /** Arrasto multi — opacidade nos cards de origem. */
  activeDragIds?: string[] | null;
  sprintBoardQuickActions?: { boardId: string; getHeaders: () => Record<string, string> };
  onAddCardFromTemplate?: (template: CardTemplate) => void;
  getHeaders?: () => Record<string, string>;
  /** Keys considered "done" for predictive hints on cards. */
  doneBucketKeys?: string[];
  /** Sample cycle times from completed cards (board-level). */
  historicalCycleDays?: number[];
}

export function KanbanColumn({
  bucket,
  cards,
  collapsed,
  onToggleCollapse,
  onAddCard,
  onEditCard,
  openingCardId,
  onDeleteCard,
  onRenameColumn,
  onDeleteColumn,
  onSetDirection,
  onOpenDesc,
  directions,
  dirColors,
  boardBuckets,
  priorities,
  onPatchCard,
  onDuplicateCard,
  onPinCardToTop,
  isFirstColumn,
  remoteCollabHighlight = false,
  activeDragIds = null,
  sprintBoardQuickActions,
  onAddCardFromTemplate,
  getHeaders,
  doneBucketKeys = [],
  historicalCycleDays,
}: KanbanColumnProps) {
  const t = useTranslations("kanban");
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const useCv = cards.length >= KANBAN_COLUMN_CARD_CV_THRESHOLD;
  const tallSlots = cards.length >= KANBAN_COLUMN_CARD_CV_THRESHOLD;
  const columnBlockedOpen = useMemo(() => countColumnBlockedOpen(cards), [cards]);
  const columnOverdueOpen = useMemo(() => countColumnOverdueOpen(cards, Date.now()), [cards]);
  const isFinalColumn = doneBucketKeys.includes(bucket.key);
  const policyText =
    typeof (bucket as { policy?: string }).policy === "string"
      ? (bucket as { policy: string }).policy.trim()
      : "";
  const wipOver =
    typeof bucket.wipLimit === "number" &&
    bucket.wipLimit > 0 &&
    cards.length > bucket.wipLimit;
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: bucket.key });

  const { setNodeRef: setBucketRef, isOver } = useDroppable({ id: `bucket-${bucket.key}` });
  const columnBodyScrollRef = useRef<HTMLDivElement | null>(null);
  const setDropScrollRegionRef = useCallback(
    (node: HTMLDivElement | null) => {
      setBucketRef(node);
      columnBodyScrollRef.current = node;
    },
    [setBucketRef]
  );

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setSortableRef}
      style={style}
      data-flux-column-key={bucket.key}
      {...(isFirstColumn ? { "data-tour": "board-column" as const } : {})}
      className={`min-w-[min(272px,86vw)] snap-start sm:min-w-[280px] max-w-[380px] flex-1 flex-[1_1_280px] rounded-[12px] border border-[var(--flux-border-subtle)] bg-[color-mix(in_srgb,var(--flux-surface-dark)_58%,var(--flux-surface-card)_42%)] backdrop-blur-[10px] flex flex-col max-h-[min(72dvh,calc(100dvh-220px))] md:max-h-[calc(100vh-165px)] transition-all shadow-[var(--flux-shadow-kanban-column)] ${
        collapsed ? "min-w-[72px] max-w-[72px] flex-[0_0_72px] cursor-pointer overflow-hidden min-h-0 h-fit" : ""
      } ${isOver ? "bg-[var(--flux-primary-glow)] ring-1 ring-[var(--flux-border-default)]" : ""} ${
        remoteCollabHighlight ? "ring-2 ring-[var(--flux-primary)]/55 ring-offset-2 ring-offset-[var(--flux-surface-card)]" : ""
      }`}
    >
      {collapsed ? (
        <CustomTooltip
          content={
            wipOver
              ? `${t("column.collapsedTooltip", { label: bucket.label, count: cards.length })} — ${t("column.tooltips.wipExceeded")}`
              : t("column.collapsedTooltip", { label: bucket.label, count: cards.length })
          }
          position="right"
        >
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
              style={{ background: bucket.color || "var(--flux-text-muted)" }}
              aria-hidden
            />
            <span className="font-display font-bold text-sm text-[var(--flux-text)] tabular-nums">
              {typeof bucket.wipLimit === "number" ? `${cards.length}/${bucket.wipLimit}` : cards.length}
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
          style={{ background: bucket.color || "var(--flux-text-muted)" }}
        />
        <div className="font-display font-bold text-xs text-[var(--flux-text)] flex-1 min-w-0 truncate flex items-center">
          {bucket.label}
          <span className="ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--flux-chrome-alpha-12)] px-1.5 text-flux-xs font-semibold tabular-nums text-[var(--flux-text-muted)]">
            {cards.length}
          </span>
        </div>
        {policyText ? (
          <CustomTooltip content={policyText} position="top">
            <span
              className="shrink-0 w-6 h-6 rounded-full border border-[var(--flux-chrome-alpha-14)] text-[11px] font-bold text-[var(--flux-text-muted)] flex items-center justify-center hover:border-[var(--flux-primary)]"
              aria-label={t("column.tooltips.policy")}
            >
              i
            </span>
          </CustomTooltip>
        ) : null}
        {wipOver ? (
          <CustomTooltip content={t("column.tooltips.wipExceeded")} position="top">
            <div
              className="font-display font-bold text-xs text-white px-2.5 py-0.5 rounded-full min-w-[22px] text-center shrink-0 tabular-nums ring-2 ring-[var(--flux-warning)]"
              style={{ background: bucket.color || "var(--flux-text-muted)" }}
            >
              {typeof bucket.wipLimit === "number" ? `${cards.length}/${bucket.wipLimit}` : cards.length}
            </div>
          </CustomTooltip>
        ) : (
          <div
            className="font-display font-bold text-xs text-white px-2.5 py-0.5 rounded-full min-w-[22px] text-center shrink-0 tabular-nums"
            style={{ background: bucket.color || "var(--flux-text-muted)" }}
          >
            {typeof bucket.wipLimit === "number" ? `${cards.length}/${bucket.wipLimit}` : cards.length}
          </div>
        )}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="relative">
            <CustomTooltip content={t("column.tooltips.newCard")} position="top">
              <button
                type="button"
                data-tour={isFirstColumn ? "board-new-card" : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onAddCardFromTemplate && getHeaders) {
                    setTemplatePickerOpen((v) => !v);
                  } else {
                    onAddCard();
                  }
                }}
                className="w-6 h-6 rounded-full border border-[var(--flux-control-border)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text-muted)] flex items-center justify-center text-[11px] hover:border-[var(--flux-primary)] hover:text-[var(--flux-primary-light)] hover:bg-[var(--flux-primary-glow)]"
                aria-label={t("column.tooltips.newCard")}
              >
                +
              </button>
            </CustomTooltip>
            {templatePickerOpen && getHeaders && (
              <CardTemplatePicker
                getHeaders={getHeaders}
                onBlank={() => { setTemplatePickerOpen(false); onAddCard(); }}
                onSelect={(tpl) => { setTemplatePickerOpen(false); onAddCardFromTemplate?.(tpl); }}
                onClose={() => setTemplatePickerOpen(false)}
              />
            )}
          </div>
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
                className="w-6 h-6 rounded-full border border-[var(--flux-control-border)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text-muted)] flex items-center justify-center text-[11px] hover:border-[var(--flux-danger)] hover:text-[var(--flux-danger)] hover:bg-[var(--flux-danger-alpha-08)]"
                aria-label={t("column.tooltips.deleteColumn")}
              >
                ×
              </button>
            </CustomTooltip>
          )}
        </div>
      </div>

        {columnBlockedOpen > 0 || columnOverdueOpen > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 px-3 py-1.5 border-b border-[var(--flux-border-muted)] bg-[var(--flux-black-alpha-04)]">
            {columnBlockedOpen > 0 ? (
              <CustomTooltip
                content={t("column.flowInsights.blockedTooltip", { count: columnBlockedOpen })}
                position="top"
              >
                <span className="text-flux-xs font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border border-[var(--flux-chrome-alpha-18)] bg-[var(--flux-black-alpha-12)] text-[var(--flux-text-muted)] tabular-nums">
                  {t("column.flowInsights.blockedChip", { count: columnBlockedOpen })}
                </span>
              </CustomTooltip>
            ) : null}
            {columnOverdueOpen > 0 ? (
              <CustomTooltip
                content={t("column.flowInsights.overdueTooltip", { count: columnOverdueOpen })}
                position="top"
              >
                <span className="text-flux-xs font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border border-[var(--flux-danger-alpha-35)] bg-[var(--flux-danger-alpha-10)] text-[var(--flux-danger)] tabular-nums">
                  {t("column.flowInsights.overdueChip", { count: columnOverdueOpen })}
                </span>
              </CustomTooltip>
            ) : null}
          </div>
        ) : null}

        <div
          ref={setDropScrollRegionRef}
          role="region"
          aria-label={t("column.dropRegionAriaLabel", { label: bucket.label })}
          className="p-2.5 flex-1 overflow-y-auto flex flex-col gap-1.5 min-h-[50px] scrollbar-kanban"
        >
          <KanbanColumnCardList
            scrollRef={columnBodyScrollRef}
            bucketKey={bucket.key}
            cards={cards}
            useCv={useCv}
            tallSlots={tallSlots}
            isFirstColumn={isFirstColumn}
            directions={directions}
            dirColors={dirColors}
            boardBuckets={boardBuckets}
            priorities={priorities}
            onEditCard={onEditCard}
            openingCardId={openingCardId}
            onDeleteCard={onDeleteCard}
            onSetDirection={onSetDirection}
            onOpenDesc={onOpenDesc}
            onPatchCard={onPatchCard}
            onDuplicateCard={onDuplicateCard}
            onPinCardToTop={onPinCardToTop}
            activeDragIds={activeDragIds}
            sprintBoardQuickActions={sprintBoardQuickActions}
            historicalCycleDays={historicalCycleDays}
            isFinalColumn={isFinalColumn}
            columnEmpty={
              <div
                {...(isFirstColumn ? { "data-tour": "board-card" as const } : {})}
                className="min-h-[52px] rounded-[var(--flux-rad-sm)] border border-dashed border-[var(--flux-chrome-alpha-16)] bg-[var(--flux-black-alpha-08)] flex items-center justify-center px-2 py-4 text-center text-xs text-[var(--flux-text-muted)]/50"
              >
                {isFirstColumn ? t("column.tourEmptyCardHint") : t("column.emptyHint")}
              </div>
            }
            addCardFooter={
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddCard();
                }}
                className="mt-1 w-full rounded-[var(--flux-rad-sm)] border border-dashed border-[var(--flux-chrome-alpha-16)] bg-transparent py-2 text-xs font-medium text-[var(--flux-text-muted)] flex items-center justify-center gap-1.5 transition-colors hover:border-[var(--flux-primary)] hover:text-[var(--flux-primary-light)] hover:bg-[var(--flux-primary-glow)] active:scale-[0.98]"
                aria-label={t("column.tooltips.newCard")}
              >
                <span className="text-sm leading-none">+</span>
                {t("column.addCardButton")}
              </button>
            }
          />
        </div>
        </>
      )}
    </div>
  );
}

