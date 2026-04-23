"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { CardData, BucketConfig } from "@/app/board/[id]/page";

type RoadmapLane = "overdue" | "week" | "later" | "none";

function daysFromToday(due: string | null | undefined): number | null {
  if (!due || typeof due !== "string") return null;
  const d = new Date(`${due.trim()}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - today.getTime()) / 86400000);
}

function laneFor(due: string | null | undefined): RoadmapLane {
  const days = daysFromToday(due);
  if (days === null) return "none";
  if (days < 0) return "overdue";
  if (days <= 7) return "week";
  return "later";
}

function isDone(c: CardData) {
  return c.progress === "Concluída";
}

export type BoardRoadmapProjectionViewProps = {
  buckets: BucketConfig[];
  cards: CardData[];
  filterCard: (c: CardData) => boolean;
  onOpenCard: (card: CardData) => void;
};

export function BoardRoadmapProjectionView({
  cards,
  filterCard,
  onOpenCard,
}: BoardRoadmapProjectionViewProps) {
  const t = useTranslations("kanban.board.roadmapProjection");
  const visible = useMemo(() => cards.filter(filterCard), [cards, filterCard]);

  const byLane = useMemo(() => {
    const m: Record<RoadmapLane, CardData[]> = { overdue: [], week: [], later: [], none: [] };
    for (const c of visible) {
      if (isDone(c)) continue;
      m[laneFor(c.dueDate)].push(c);
    }
    for (const lane of Object.keys(m) as RoadmapLane[]) {
      m[lane].sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
    }
    return m;
  }, [visible]);

  const laneOrder: RoadmapLane[] = ["overdue", "week", "later", "none"];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 w-full min-w-0">
      {laneOrder.map((lane) => {
        const items = byLane[lane];
        return (
          <section
            key={lane}
            className="flex flex-col rounded-[var(--flux-rad-lg)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] p-3 min-h-[200px]"
          >
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--flux-text-muted)] mb-2">
              {t(`lanes.${lane}`)}
            </h3>
            <div className="space-y-2 flex-1">
              {items.length === 0 ? (
                <p className="text-xs text-[var(--flux-text-muted)]">{t("empty")}</p>
              ) : (
                items.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onOpenCard(c)}
                    className="w-full text-left rounded-md border border-[var(--flux-control-border)] px-2.5 py-1.5 text-xs hover:border-[var(--flux-primary-alpha-35)] transition-colors"
                  >
                    <div className="font-medium truncate text-[var(--flux-text)]">{c.title}</div>
                    {c.dueDate ? (
                      <div className="text-[10px] text-[var(--flux-text-muted)] tabular-nums mt-0.5">{c.dueDate}</div>
                    ) : null}
                  </button>
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
