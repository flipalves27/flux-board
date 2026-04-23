"use client";

import { useTranslations } from "next-intl";
import type { BucketConfig, CardData } from "@/app/board/[id]/page";
import { BoardSafeContextStrip } from "@/components/board-methodology/safe/board-safe-context-strip";

export type BoardSafeDetailChromeProps = {
  buckets: BucketConfig[];
  cards: CardData[];
  onOpenAssist: () => void;
  onCollapseDetailChrome: () => void;
  className?: string;
};

export function BoardSafeDetailChrome({
  buckets,
  cards,
  onOpenAssist,
  onCollapseDetailChrome,
  className = "",
}: BoardSafeDetailChromeProps) {
  const t = useTranslations("kanban.board");
  return (
    <div className={`relative ${className}`.trim()}>
      <button
        type="button"
        onClick={onCollapseDetailChrome}
        className="absolute left-2 top-2 z-[1] rounded-md p-1 text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-surface-hover)] transition-colors"
        aria-label={t("detailChrome.collapse")}
        aria-expanded
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
          <path d="M18 15l-6-6-6 6" />
        </svg>
      </button>
      <BoardSafeContextStrip buckets={buckets} cards={cards} onOpenAssist={onOpenAssist} className="pl-10 sm:pl-11" />
    </div>
  );
}
