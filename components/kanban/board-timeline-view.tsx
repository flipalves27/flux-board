"use client";

import { useCallback, useMemo, useState } from "react";
import type { CardData, BucketConfig } from "@/app/board/[id]/page";
import { useTranslations } from "next-intl";

const DAY_PX = 36;
const ROW_H = 44;
const BAR_H = 22;
const LABEL_W = 220;

function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map((n) => Number(n));
  if (!y || !m || !d) return new Date(NaN);
  return new Date(y, m - 1, d);
}

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

function addDaysYmd(ymd: string, delta: number): string {
  const d = parseYmd(ymd);
  if (Number.isNaN(d.getTime())) return ymd;
  d.setDate(d.getDate() + delta);
  return formatYmd(d);
}

function bucketColor(buckets: BucketConfig[], bucketKey: string): string {
  return buckets.find((b) => b.key === bucketKey)?.color ?? "var(--flux-primary)";
}

type WithDue = CardData & { dueDate: string };

type DisplayRow =
  | { kind: "group"; key: string; label: string }
  | { kind: "card"; card: WithDue };

export type TimelineGroupBy = "flat" | "column" | "priority";

export interface BoardTimelineViewProps {
  cards: CardData[];
  buckets: BucketConfig[];
  /** Used for Y-axis grouping when group mode is "priority". */
  prioritiesOrder?: string[];
  filterCard: (c: CardData) => boolean;
  onChangeDueDate: (cardId: string, nextDue: string) => void;
  onOpenCard: (card: CardData) => void;
}

function sortCardsByDueThenTitle(a: WithDue, b: WithDue): number {
  const cmp = a.dueDate.localeCompare(b.dueDate);
  if (cmp !== 0) return cmp;
  return a.title.localeCompare(b.title);
}

export function BoardTimelineView({
  cards,
  buckets,
  prioritiesOrder = ["Urgente", "Importante", "Média"],
  filterCard,
  onChangeDueDate,
  onOpenCard,
}: BoardTimelineViewProps) {
  const t = useTranslations("kanban.board.timeline");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<TimelineGroupBy>("flat");

  const withDueBase = useMemo(() => {
    return cards
      .filter((c) => Boolean(c.dueDate && String(c.dueDate).trim()))
      .filter(filterCard)
      .map((c) => ({ ...c, dueDate: String(c.dueDate).trim() })) as WithDue[];
  }, [cards, filterCard]);

  const displayRows = useMemo((): DisplayRow[] => {
    if (withDueBase.length === 0) return [];

    if (groupBy === "flat") {
      const sorted = [...withDueBase].sort(sortCardsByDueThenTitle);
      return sorted.map((card) => ({ kind: "card", card }));
    }

    if (groupBy === "column") {
      const rows: DisplayRow[] = [];
      for (const b of buckets) {
        const groupCards = withDueBase.filter((c) => c.bucket === b.key).sort(sortCardsByDueThenTitle);
        if (groupCards.length === 0) continue;
        rows.push({ kind: "group", key: `col:${b.key}`, label: b.label });
        for (const card of groupCards) rows.push({ kind: "card", card });
      }
      return rows;
    }

    const rows: DisplayRow[] = [];
    const order = [...prioritiesOrder];
    const extras = [...new Set(withDueBase.map((c) => c.priority))].filter((p) => !order.includes(p));
    const fullOrder = [...order, ...extras.sort((a, b) => a.localeCompare(b))];

    for (const p of fullOrder) {
      const groupCards = withDueBase.filter((c) => c.priority === p).sort(sortCardsByDueThenTitle);
      if (groupCards.length === 0) continue;
      rows.push({ kind: "group", key: `prio:${p}`, label: p });
      for (const card of groupCards) rows.push({ kind: "card", card });
    }
    return rows;
  }, [withDueBase, buckets, groupBy, prioritiesOrder]);

  const cardRows = useMemo(() => displayRows.filter((r): r is Extract<DisplayRow, { kind: "card" }> => r.kind === "card"), [displayRows]);

  const { dayLabels } = useMemo(() => {
    if (cardRows.length === 0) {
      const today = formatYmd(new Date());
      return { dayLabels: [today] };
    }
    let min = cardRows[0].card.dueDate;
    let max = cardRows[0].card.dueDate;
    for (const r of cardRows) {
      const d = r.card.dueDate;
      if (d < min) min = d;
      if (d > max) max = d;
    }
    const minPadded = addDaysYmd(min, -7);
    const maxPadded = addDaysYmd(max, 7);
    const labels: string[] = [];
    let cur = parseYmd(minPadded);
    const end = parseYmd(maxPadded);
    while (cur <= end) {
      labels.push(formatYmd(cur));
      const n = new Date(cur);
      n.setDate(n.getDate() + 1);
      cur = n;
    }
    return { dayLabels: labels };
  }, [cardRows]);

  const totalDays = dayLabels.length;
  const gridWidth = Math.max(totalDays * DAY_PX, 320);

  const idToRow = useMemo(() => {
    const m = new Map<string, number>();
    displayRows.forEach((r, i) => {
      if (r.kind === "card") m.set(r.card.id, i);
    });
    return m;
  }, [displayRows]);

  const dependencyPaths = useMemo(() => {
    const paths: { d: string; key: string }[] = [];
    for (const r of cardRows) {
      const card = r.card;
      const blockers = card.blockedBy || [];
      for (const bid of blockers) {
        const from = idToRow.get(bid);
        const to = idToRow.get(card.id);
        if (from === undefined || to === undefined || from === to) continue;

        const blocker = cardRows.find((x) => x.card.id === bid)?.card;
        const blocked = card;
        if (!blocker || !blocked) continue;

        const startIdx = dayLabels.indexOf(blocker.dueDate);
        const endIdx = dayLabels.indexOf(blocked.dueDate);
        if (startIdx < 0 || endIdx < 0) continue;

        const bx1 = startIdx * DAY_PX + DAY_PX - 6;
        const bx2 = endIdx * DAY_PX + 4;
        const y1 = from * ROW_H + ROW_H / 2;
        const y2 = to * ROW_H + ROW_H / 2;
        const midX = Math.max(bx1 + 8, (bx1 + bx2) / 2);

        const d = `M ${bx1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${bx2} ${y2}`;
        paths.push({ d, key: `${bid}->${card.id}` });
      }
    }
    return paths;
  }, [cardRows, idToRow, dayLabels]);

  const dayIndex = useCallback(
    (ymd: string) => {
      const i = dayLabels.indexOf(ymd);
      return i < 0 ? 0 : i;
    },
    [dayLabels]
  );

  const onPointerDownBar = useCallback(
    (ev: React.PointerEvent, card: CardData) => {
      if (!card.dueDate) return;
      ev.preventDefault();
      ev.stopPropagation();
      const originDue = card.dueDate;
      const startX = ev.clientX;
      let lastEmitted = originDue;

      const move = (e: PointerEvent) => {
        const dx = e.clientX - startX;
        const deltaDays = Math.round(dx / DAY_PX);
        const next = addDaysYmd(originDue, deltaDays);
        if (next !== lastEmitted) {
          lastEmitted = next;
          onChangeDueDate(card.id, next);
        }
      };

      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        setDraggingId(null);
      };

      setDraggingId(card.id);
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    },
    [onChangeDueDate]
  );

  if (cardRows.length === 0) {
    return (
      <div className="w-full py-12 flex flex-col items-center justify-center text-center border border-dashed border-[var(--flux-primary-alpha-25)] rounded-[var(--flux-rad)] bg-[var(--flux-black-alpha-12)]">
        <p className="text-sm font-display font-semibold text-[var(--flux-text)]">{t("emptyTitle")}</p>
        <p className="mt-2 text-xs text-[var(--flux-text-muted)] max-w-md">{t("emptyHint")}</p>
      </div>
    );
  }

  const totalHeight = displayRows.length * ROW_H;

  return (
    <div className="w-full py-4 pb-6 overflow-x-auto scrollbar-flux min-h-[calc(100vh-200px)]">
      <div className="inline-flex min-w-full flex-col rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-mid)] overflow-hidden">
        <div
          className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-black-alpha-10)]"
          role="group"
          aria-label={t("groupByAria")}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--flux-text-muted)]">{t("groupByLabel")}</span>
          {(["flat", "column", "priority"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setGroupBy(mode)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                groupBy === mode
                  ? "bg-[var(--flux-primary)] text-white shadow-[0_2px_6px_var(--flux-primary-alpha-35)]"
                  : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-surface-hover)]"
              }`}
            >
              {mode === "flat" ? t("groupFlat") : mode === "column" ? t("groupColumn") : t("groupPriority")}
            </button>
          ))}
        </div>

        <div className="flex border-b border-[var(--flux-chrome-alpha-08)]">
          <div
            className="shrink-0 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[var(--flux-text-muted)] bg-[var(--flux-black-alpha-15)] flex items-end"
            style={{ width: LABEL_W }}
          >
            {t("columnTask")}
          </div>
          <div className="relative overflow-x-auto" style={{ width: gridWidth }}>
            <div className="flex" style={{ width: gridWidth }}>
              {dayLabels.map((ymd) => {
                const [yy, mm, dd] = ymd.split("-");
                const isWeekend = (() => {
                  const d = parseYmd(ymd);
                  const w = d.getDay();
                  return w === 0 || w === 6;
                })();
                return (
                  <div
                    key={ymd}
                    className={`shrink-0 border-l border-[var(--flux-chrome-alpha-06)] text-center py-1.5 ${
                      isWeekend ? "bg-[var(--flux-black-alpha-12)]" : ""
                    }`}
                    style={{ width: DAY_PX }}
                  >
                    <div className="text-[9px] text-[var(--flux-text-muted)] tabular-nums">
                      {dd}/{mm}
                    </div>
                    <div className="text-[8px] text-[var(--flux-text-muted)]/70">{yy}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex relative">
          <div className="shrink-0 border-r border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-black-alpha-08)]" style={{ width: LABEL_W }}>
            {displayRows.map((r) =>
              r.kind === "group" ? (
                <div
                  key={r.key}
                  className="w-full px-3 border-b border-[var(--flux-chrome-alpha-06)] flex items-center bg-[var(--flux-black-alpha-14)]"
                  style={{ height: ROW_H }}
                >
                  <span className="text-[11px] font-bold text-[var(--flux-primary-light)] truncate">{r.label}</span>
                </div>
              ) : (
                <button
                  key={r.card.id}
                  type="button"
                  onClick={() => onOpenCard(r.card)}
                  className="w-full text-left px-3 border-b border-[var(--flux-chrome-alpha-05)] hover:bg-[var(--flux-primary-alpha-12)] transition-colors"
                  style={{ height: ROW_H }}
                >
                  <div className="text-xs font-semibold text-[var(--flux-text)] truncate leading-tight">{r.card.title}</div>
                  <div className="text-[10px] text-[var(--flux-text-muted)] truncate font-mono">{r.card.id}</div>
                </button>
              )
            )}
          </div>

          <div className="relative overflow-x-auto" style={{ width: gridWidth }}>
            <div className="relative" style={{ width: gridWidth, height: totalHeight }}>
              <svg
                className="absolute inset-0 pointer-events-none z-[1]"
                width={gridWidth}
                height={totalHeight}
                aria-hidden
              >
                {dependencyPaths.map((p) => (
                  <path
                    key={p.key}
                    d={p.d}
                    fill="none"
                    stroke="var(--flux-secondary-alpha-55)"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
              </svg>

              {displayRows.map((r, rowIdx) => {
                if (r.kind === "group") {
                  return (
                    <div
                      key={r.key}
                      className="absolute left-0 right-0 border-b border-[var(--flux-chrome-alpha-06)] bg-[var(--flux-black-alpha-08)]"
                      style={{ top: rowIdx * ROW_H, height: ROW_H }}
                    />
                  );
                }
                const card = r.card;
                const idx = dayIndex(card.dueDate);
                const left = idx * DAY_PX + 4;
                const col = bucketColor(buckets, card.bucket);
                return (
                  <div
                    key={card.id}
                    className="absolute left-0 right-0 border-b border-[var(--flux-chrome-alpha-05)]"
                    style={{ top: rowIdx * ROW_H, height: ROW_H }}
                  >
                    <div
                      role="slider"
                      tabIndex={0}
                      aria-label={t("barAria", { title: card.title, date: card.dueDate })}
                      aria-valuemin={0}
                      aria-valuemax={totalDays - 1}
                      aria-valuenow={idx}
                      className={`absolute rounded-md shadow-sm cursor-grab active:cursor-grabbing z-[2] touch-none ${
                        draggingId === card.id ? "ring-2 ring-[var(--flux-secondary)]" : ""
                      }`}
                      style={{
                        left,
                        width: DAY_PX - 8,
                        top: (ROW_H - BAR_H) / 2,
                        height: BAR_H,
                        background: `linear-gradient(180deg, ${col}dd, ${col}99)`,
                        border: `1px solid ${col}`,
                      }}
                      onPointerDown={(e) => onPointerDownBar(e, card)}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowLeft") {
                          e.preventDefault();
                          onChangeDueDate(card.id, addDaysYmd(card.dueDate, -1));
                        } else if (e.key === "ArrowRight") {
                          e.preventDefault();
                          onChangeDueDate(card.id, addDaysYmd(card.dueDate, 1));
                        }
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
