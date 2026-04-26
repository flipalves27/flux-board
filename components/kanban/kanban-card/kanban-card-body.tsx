"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CustomTooltip } from "@/components/ui/custom-tooltip";
import type { BucketConfig, CardData } from "@/app/board/[id]/page";
import { AiRefineHintBadge, MatrixWeightBadge, SubtaskProgressMini } from "./kanban-card-badges";
import type { SubtaskItem } from "./kanban-card-utils";
import type { DeliveryPrediction } from "@/lib/predictive-delivery";
import { isSprintMethodology, type BoardMethodology } from "@/lib/board-methodology";

export type KanbanCardBodyProps = {
  t: (key: string, values?: Record<string, string | number>) => string;
  card: CardData;
  cardId: string;
  directions: string[];
  boardMethodology: string;
  prioLabel: string;
  progLabel: string;
  prioClass: string;
  progColor: string;
  dueClass: string;
  dueText: string;
  dr: number | null;
  matrixWeight: number | null;
  showExpedite: boolean;
  showDatebound: boolean;
  showIntangibleBadge: boolean;
  showPrioritizeHeuristic: boolean;
  showCompleteMove: boolean;
  showAiRefineHint: boolean;
  buckets: BucketConfig[];
  onOpenDesc?: (cardId: string) => void;
  onPatchCard?: (cardId: string, patch: Partial<{ priority: string; bucket: string }>) => void;
  handleOpenDesc: () => void;
  handleSetDir: (dir: string) => void;
  stopDrag: (e: React.SyntheticEvent) => void;
  setTouchPinned: (v: boolean) => void;
  delivery: DeliveryPrediction | null;
  sprintActiveChip?: { label: string; title: string } | null;
};

export function KanbanCardBody(p: KanbanCardBodyProps) {
  const {
    t,
    card,
    cardId,
    directions,
    boardMethodology,
    prioLabel,
    progLabel,
    prioClass,
    progColor,
    dueClass,
    dueText,
    dr,
    matrixWeight,
    showExpedite,
    showDatebound,
    showIntangibleBadge,
    showPrioritizeHeuristic,
    showCompleteMove,
    showAiRefineHint,
    buckets,
    onOpenDesc,
    onPatchCard,
    handleOpenDesc,
    handleSetDir,
    stopDrag,
    setTouchPinned,
    delivery,
    sprintActiveChip,
  } = p;

  return (
    <>
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

          {showCompleteMove ? (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={stopDrag}
                  title={t("card.completeMove.tooltip")}
                  className="card-complete-btn h-[22px] w-[22px] rounded-md border border-[var(--flux-control-border)] bg-[var(--flux-surface-card)] text-[var(--flux-text-muted)] flex items-center justify-center shrink-0 hover:bg-[var(--flux-success-solid-dark)] hover:text-white hover:border-[var(--flux-success-solid-dark)] transition-all duration-200 max-md:h-8 max-md:w-auto max-md:min-w-[44px] max-md:gap-1 max-md:px-2 [&_svg]:w-3 [&_svg]:h-3 [&_svg]:stroke-[2.5]"
                  aria-label={t("card.completeMove.tooltip")}
                  aria-haspopup="menu"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  <span className="hidden text-[10px] font-bold max-md:inline">{t("card.completeMove.mobileLabel")}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                sideOffset={6}
                className="min-w-[220px] max-h-[min(320px,50vh)] overflow-y-auto scrollbar-kanban"
                onCloseAutoFocus={(e) => e.preventDefault()}
              >
                <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">
                  {t("card.completeMove.menuTitle")}
                </div>
                {buckets.map((b) => (
                  <DropdownMenuItem
                    key={b.key}
                    disabled={b.key === card.bucket}
                    className="gap-2"
                    onSelect={() => {
                      onPatchCard?.(cardId, { bucket: b.key });
                      setTouchPinned(false);
                    }}
                  >
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: b.color || "var(--flux-text-muted)" }}
                      aria-hidden
                    />
                    <span className="min-w-0 truncate">{b.label}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}

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

          {sprintActiveChip ? (
            <span
              role="status"
              aria-label={sprintActiveChip.title}
              title={sprintActiveChip.title}
              className="inline-flex max-w-[7rem] shrink-0 items-center gap-0.5 rounded-md border border-[var(--flux-primary-alpha-35)] bg-[var(--flux-primary-alpha-10)] px-1 py-0 text-[9px] font-bold uppercase tracking-wide text-[var(--flux-primary-light)]"
            >
              <span className="shrink-0 opacity-80" aria-hidden>
                ◆
              </span>
              <span className="min-w-0 truncate" aria-hidden>
                {sprintActiveChip.label}
              </span>
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-1 card-top-right">
          <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${prioClass}`}>
            {prioLabel}
          </span>
          {matrixWeight !== null ? (
            <MatrixWeightBadge weight={matrixWeight} band={card.matrixWeightBand} />
          ) : null}
        </div>
      </div>
      <div className="flex items-start gap-1.5 mb-1.5">
        <span className="font-display font-bold text-sm text-[var(--flux-text)] leading-tight flex-1 min-w-0">
          {card.title}
        </span>
        {card.createdByFluxy ? (
          <span
            className="shrink-0 rounded-md border border-[var(--flux-primary-alpha-35)] bg-[var(--flux-primary-alpha-10)] px-1 py-0.5 text-[9px] font-bold text-[var(--flux-primary-light)]"
            title={t("card.aiHints.fluxyGenerated")}
          >
            🤖
          </span>
        ) : null}
        {showAiRefineHint && (
          <AiRefineHintBadge tooltip={t("card.aiHints.refineAvailable")} />
        )}
      </div>
      {card.progress !== "Concluída" &&
      (showExpedite ||
        showDatebound ||
        showIntangibleBadge ||
        (Array.isArray(card.blockedBy) && card.blockedBy.length > 0) ||
        showPrioritizeHeuristic) ? (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {showExpedite ? (
            <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border border-[var(--flux-danger-alpha-35)] bg-[var(--flux-danger-alpha-12)] text-[var(--flux-danger)]">
              {t("card.serviceClass.expedite")}
            </span>
          ) : null}
          {showDatebound ? (
            <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border border-[var(--flux-warning-alpha-35)] bg-[var(--flux-warning-alpha-10)] text-[var(--flux-warning)]">
              {t("card.serviceClass.datebound")}
            </span>
          ) : null}
          {Array.isArray(card.blockedBy) && card.blockedBy.length > 0 ? (
            <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border border-[var(--flux-chrome-alpha-18)] bg-[var(--flux-black-alpha-12)] text-[var(--flux-text-muted)]">
              {t("card.serviceClass.blocked")}
            </span>
          ) : null}
          {showIntangibleBadge ? (
            <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border border-[var(--flux-secondary-alpha-35)] bg-[var(--flux-secondary-alpha-10)] text-[var(--flux-secondary)]">
              {t("card.serviceClass.intangible")}
            </span>
          ) : null}
          {showPrioritizeHeuristic ? (
            <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border border-[var(--flux-secondary-alpha-35)] bg-[var(--flux-secondary-alpha-10)] text-[var(--flux-secondary)]">
              {t("card.serviceClass.prioritize")}
            </span>
          ) : null}
        </div>
      ) : null}
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
      {Array.isArray(card.subtasks) && card.subtasks.length > 0 && (
        <SubtaskProgressMini subtasks={card.subtasks as SubtaskItem[]} />
      )}
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: progColor }} />
          <span className="text-[11px] text-[var(--flux-text-muted)] font-medium">{progLabel}</span>
        </div>
        {isSprintMethodology(boardMethodology as BoardMethodology) && typeof card.storyPoints === "number" ? (
          <span className="text-[11px] font-bold tabular-nums text-[var(--flux-primary-light)]">{card.storyPoints} SP</span>
        ) : null}
        {dr !== null && (
          <span className={`flex items-center gap-1 text-[11px] font-semibold ${dueClass}`}>
            <span>◷</span>
            {dueText}
          </span>
        )}
        {delivery && (
          <span
            className={`flex items-center gap-1 text-[11px] font-medium tabular-nums ${
              delivery.isLate
                ? "text-[var(--flux-danger)]"
                : "text-[var(--flux-text-muted)]"
            }`}
            title={`${t("card.predictiveDelivery.estimate")} ${delivery.estimatedDate} (${delivery.confidencePercent}%)`}
          >
            <span className="text-[9px]">⏱</span>
            {t("card.predictiveDelivery.estimate")} {delivery.estimatedDate.slice(5)}
            {delivery.isLate && (
              <span className="text-[9px] font-bold uppercase">{t("card.predictiveDelivery.late")}</span>
            )}
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
    </>
  );
}
