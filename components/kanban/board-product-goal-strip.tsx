"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useBoardStore } from "@/stores/board-store";
import { resolveBacklogBucketKey } from "@/lib/board-scrum";
import { BoardAccountBriefModal } from "./board-account-brief-modal";

type BoardProductGoalStripProps = {
  boardId: string;
  getHeaders: () => Record<string, string>;
  onOpenScrumSettings: () => void;
  onOpenIncrementReview: () => void;
};

export function BoardProductGoalStrip({
  boardId,
  getHeaders,
  onOpenScrumSettings,
  onOpenIncrementReview,
}: BoardProductGoalStripProps) {
  const t = useTranslations("kanban.board.productGoalStrip");
  const db = useBoardStore((s) => s.db);
  const [briefOpen, setBriefOpen] = useState(false);
  if (!db) return null;
  const goal = db.config.productGoal?.trim();
  const backlogKey = resolveBacklogBucketKey(db.config.bucketOrder, db.config.backlogBucketKey ?? null);
  const backlogLabel = backlogKey ? db.config.bucketOrder.find((b) => b.key === backlogKey)?.label ?? backlogKey : null;

  return (
    <>
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 border-b border-[var(--flux-border-muted)] bg-[var(--flux-black-alpha-04)] px-4 py-2 sm:px-5 lg:px-6">
      <div className="min-w-0 flex-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
        <span className="font-bold uppercase tracking-wide text-[var(--flux-primary-light)] shrink-0">{t("label")}</span>
        {goal ? (
          <span className="text-[var(--flux-text)] leading-snug">{goal}</span>
        ) : (
          <span className="text-[var(--flux-text-muted)] italic">{t("emptyGoal")}</span>
        )}
        {backlogLabel ? (
          <span className="text-[11px] text-[var(--flux-text-muted)] shrink-0">
            {t("backlogBadge", { column: backlogLabel })}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <button type="button" className="btn-secondary text-xs py-1.5 px-2.5" onClick={() => setBriefOpen(true)}>
          {t("accountBrief")}
        </button>
        <button type="button" className="btn-secondary text-xs py-1.5 px-2.5" onClick={onOpenIncrementReview}>
          {t("incrementReview")}
        </button>
        <button type="button" className="btn-secondary text-xs py-1.5 px-2.5" onClick={onOpenScrumSettings}>
          {t("editScrum")}
        </button>
      </div>
    </div>
    <BoardAccountBriefModal
      open={briefOpen}
      onClose={() => setBriefOpen(false)}
      boardId={boardId}
      getHeaders={getHeaders}
    />
    </>
  );
}
