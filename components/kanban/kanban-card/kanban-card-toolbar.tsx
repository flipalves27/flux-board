"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { CustomTooltip } from "@/components/ui/custom-tooltip";
import type { BucketConfig } from "@/app/board/[id]/page";
import type { SprintData } from "@/lib/schemas";

export type KanbanCardToolbarProps = {
  t: (key: string, values?: Record<string, string | number>) => string;
  cardId: string;
  cardBucket: string;
  cardPriority: string;
  prioLabel: string;
  buckets: BucketConfig[];
  priorities: string[];
  toolbarOn: boolean;
  stopDrag: (e: React.SyntheticEvent) => void;
  onPatchCard?: (cardId: string, patch: Partial<{ priority: string; bucket: string }>) => void;
  onDuplicateCard?: (cardId: string) => void;
  onDelete: () => void;
  showPin: boolean;
  onPinToTop?: (cardId: string) => void;
  setTouchPinned: (v: boolean) => void;
  hasQuick: boolean;
  showSprintQuick: boolean;
  sprintMenuMeta: {
    planning: SprintData[];
    active: SprintData | null;
    containing: SprintData[];
    visible: boolean;
  } | null;
  sprintBoardQuickActions: { boardId: string; getHeaders: () => Record<string, string> } | null;
  patchSprintCardIds: (sprintId: string, cardIds: string[]) => void;
  onSprintMenuOpenChange: (open: boolean) => void;
  onPrioMenuOpenChange: (open: boolean) => void;
  onColMenuOpenChange: (open: boolean) => void;
};

export function KanbanCardToolbar(p: KanbanCardToolbarProps) {
  const {
    t,
    cardId,
    cardBucket,
    cardPriority,
    prioLabel,
    buckets,
    priorities,
    toolbarOn,
    stopDrag,
    onPatchCard,
    onDuplicateCard,
    onDelete,
    showPin,
    onPinToTop,
    setTouchPinned,
    hasQuick,
    showSprintQuick,
    sprintMenuMeta,
    sprintBoardQuickActions,
    patchSprintCardIds,
    onSprintMenuOpenChange,
    onPrioMenuOpenChange,
    onColMenuOpenChange,
  } = p;

  return (
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
      {(hasQuick || showPin || showSprintQuick) && toolbarOn ? (
        <>
          {showSprintQuick && sprintMenuMeta && sprintBoardQuickActions ? (
            <DropdownMenu modal={false} onOpenChange={onSprintMenuOpenChange}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="h-6 w-6 shrink-0 rounded-md border border-[var(--flux-control-border)] bg-[var(--flux-surface-card)] text-[var(--flux-primary-light)] flex items-center justify-center hover:border-[var(--flux-primary)]"
                  title={t("card.sprintMenu.tooltip")}
                  aria-label={t("card.sprintMenu.tooltip")}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[200px] max-h-[min(320px,50vh)] overflow-y-auto scrollbar-kanban">
                <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">
                  {t("card.sprintMenu.title")}
                </div>
                {sprintMenuMeta.planning.map((sp) => {
                  const inSp = (sp.cardIds ?? []).includes(cardId);
                  return (
                    <DropdownMenuItem
                      key={sp.id}
                      disabled={inSp}
                      onSelect={() => {
                        if (inSp) return;
                        void patchSprintCardIds(sp.id, [...(sp.cardIds ?? []), cardId]);
                        setTouchPinned(false);
                      }}
                    >
                      {inSp ? t("card.sprintMenu.alreadyIn") : t("card.sprintMenu.addToPlanning", { name: sp.name })}
                    </DropdownMenuItem>
                  );
                })}
                {sprintMenuMeta.active && !(sprintMenuMeta.active.cardIds ?? []).includes(cardId) ? (
                  <DropdownMenuItem
                    onSelect={() => {
                      const sp = sprintMenuMeta.active!;
                      void patchSprintCardIds(sp.id, [...(sp.cardIds ?? []), cardId]);
                      setTouchPinned(false);
                    }}
                  >
                    {t("card.sprintMenu.addToActive", { name: sprintMenuMeta.active.name })}
                  </DropdownMenuItem>
                ) : null}
                {sprintMenuMeta.containing.length > 0 ? <DropdownMenuSeparator /> : null}
                {sprintMenuMeta.containing.map((sp) => (
                  <DropdownMenuItem
                    key={`rm-${sp.id}`}
                    onSelect={() => {
                      void patchSprintCardIds(
                        sp.id,
                        (sp.cardIds ?? []).filter((id) => id !== cardId)
                      );
                      setTouchPinned(false);
                    }}
                  >
                    {t("card.sprintMenu.removeFrom", { name: sp.name })}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {hasQuick ? (
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
                  {priorities.map((pr) => (
                    <DropdownMenuItem
                      key={pr}
                      disabled={pr === cardPriority}
                      onSelect={() => {
                        onPatchCard?.(cardId, { priority: pr });
                        setTouchPinned(false);
                      }}
                    >
                      {t(`cardModal.options.priority.${pr}`)}
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
                      {buckets.find((b) => b.key === cardBucket)?.label ?? cardBucket}
                    </span>
                    <span className="text-[var(--flux-text-muted)] opacity-80">▾</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[160px] max-h-[min(280px,50vh)] overflow-y-auto scrollbar-kanban">
                  {buckets.map((b) => (
                    <DropdownMenuItem
                      key={b.key}
                      disabled={b.key === cardBucket}
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
            </>
          ) : null}

          {showPin ? (
            <CustomTooltip content={t("card.quickActions.pinToTopTooltip")} position="top">
              <button
                type="button"
                className="h-6 w-6 shrink-0 rounded-md border border-[var(--flux-control-border)] bg-[var(--flux-surface-card)] text-[var(--flux-text-muted)] flex items-center justify-center hover:border-[var(--flux-primary)] hover:text-[var(--flux-primary-light)]"
                aria-label={t("card.quickActions.pinToTopTooltip")}
                onClick={() => {
                  onPinToTop?.(cardId);
                  setTouchPinned(false);
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5" aria-hidden>
                  <path d="M12 5v14M5 12l7-7 7 7" />
                </svg>
              </button>
            </CustomTooltip>
          ) : null}

          {hasQuick ? (
            <CustomTooltip content={t("card.quickActions.deleteTooltip")} position="top">
              <button
                type="button"
                className="h-6 w-6 shrink-0 rounded-md border border-[var(--flux-control-border)] bg-[var(--flux-surface-card)] text-[var(--flux-danger)] flex items-center justify-center hover:bg-[var(--flux-danger-alpha-15)] hover:border-[var(--flux-danger)]"
                aria-label={t("card.quickActions.deleteTooltip")}
                onClick={() => {
                  onDelete();
                  setTouchPinned(false);
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5" aria-hidden>
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14zM10 11v6M14 11v6" />
                </svg>
              </button>
            </CustomTooltip>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
