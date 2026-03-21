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

export interface BoardTimelineViewProps {
  cards: CardData[];
  buckets: BucketConfig[];
  filterCard: (c: CardData) => boolean;
  onChangeDueDate: (cardId: string, nextDue: string) => void;
  onOpenCard: (card: CardData) => void;
}

export function BoardTimelineView({
  cards,
  buckets,
  filterCard,
  onChangeDueDate,
  onOpenCard,
}: BoardTimelineViewProps) {
  const t = useTranslations("kanban.board.timeline");
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const withDue = cards
      .filter((c) => Boolean(c.dueDate && String(c.dueDate).trim()))
      .filter(filterCard)
      .map((c) => ({ ...c, dueDate: String(c.dueDate).trim() }));

    withDue.sort((a, b) => {
      const cmp = a.dueDate!.localeCompare(b.dueDate!);
      if (cmp !== 0) return cmp;
      return a.title.localeCompare(b.title);
    });

    return withDue;
  }, [cards, filterCard]);

  const { dayLabels } = useMemo(() => {
    if (rows.length === 0) {
      const today = formatYmd(new Date());
      return { dayLabels: [today] };
    }
    let min = rows[0].dueDate!;
    let max = rows[0].dueDate!;
    for (const r of rows) {
      const d = r.dueDate!;
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
  }, [rows]);

  const totalDays = dayLabels.length;
  const gridWidth = Math.max(totalDays * DAY_PX, 320);

  const idToRow = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r, i) => m.set(r.id, i));
    return m;
  }, [rows]);

  const dependencyPaths = useMemo(() => {
    const paths: { d: string; key: string }[] = [];
    for (const card of rows) {
      const blockers = card.blockedBy || [];
      for (const bid of blockers) {
        const from = idToRow.get(bid);
        const to = idToRow.get(card.id);
        if (from === undefined || to === undefined || from === to) continue;

        const blocker = rows[from];
        const blocked = rows[to];
        if (!blocker || !blocked) continue;

        const startIdx = dayLabels.indexOf(blocker.dueDate!);
        const endIdx = dayLabels.indexOf(blocked.dueDate!);
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
  }, [rows, idToRow, dayLabels]);

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

  if (rows.length === 0) {
    return (
      <div className="w-full py-12 flex flex-col items-center justify-center text-center border border-dashed border-[var(--flux-primary-alpha-25)] rounded-[var(--flux-rad)] bg-[var(--flux-black-alpha-12)]">
        <p className="text-sm font-display font-semibold text-[var(--flux-text)]">{t("emptyTitle")}</p>
        <p className="mt-2 text-xs text-[var(--flux-text-muted)] max-w-md">{t("emptyHint")}</p>
      </div>
    );
  }

  return (
    <div className="w-full py-4 pb-6 overflow-x-auto scrollbar-flux min-h-[calc(100vh-200px)]">
      <div className="inline-flex min-w-full flex-col rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-mid)] overflow-hidden">
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
            {rows.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onOpenCard(r)}
                className="w-full text-left px-3 border-b border-[var(--flux-chrome-alpha-05)] hover:bg-[var(--flux-primary-alpha-12)] transition-colors"
                style={{ height: ROW_H }}
              >
                <div className="text-xs font-semibold text-[var(--flux-text)] truncate leading-tight">{r.title}</div>
                <div className="text-[10px] text-[var(--flux-text-muted)] truncate font-mono">{r.id}</div>
              </button>
            ))}
          </div>

          <div className="relative overflow-x-auto" style={{ width: gridWidth }}>
            <div className="relative" style={{ width: gridWidth, height: rows.length * ROW_H }}>
              <svg
                className="absolute inset-0 pointer-events-none z-[1]"
                width={gridWidth}
                height={rows.length * ROW_H}
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

              {rows.map((r, rowIdx) => {
                const idx = dayIndex(r.dueDate!);
                const left = idx * DAY_PX + 4;
                const col = bucketColor(buckets, r.bucket);
                return (
                  <div
                    key={r.id}
                    className="absolute left-0 right-0 border-b border-[var(--flux-chrome-alpha-05)]"
                    style={{ top: rowIdx * ROW_H, height: ROW_H }}
                  >
                    <div
                      role="slider"
                      tabIndex={0}
                      aria-label={t("barAria", { title: r.title, date: r.dueDate })}
                      aria-valuemin={0}
                      aria-valuemax={totalDays - 1}
                      aria-valuenow={idx}
                      className={`absolute rounded-md shadow-sm cursor-grab active:cursor-grabbing z-[2] touch-none ${
                        draggingId === r.id ? "ring-2 ring-[var(--flux-secondary)]" : ""
                      }`}
                      style={{
                        left,
                        width: DAY_PX - 8,
                        top: (ROW_H - BAR_H) / 2,
                        height: BAR_H,
                        background: `linear-gradient(180deg, ${col}dd, ${col}99)`,
                        border: `1px solid ${col}`,
                      }}
                      onPointerDown={(e) => onPointerDownBar(e, r)}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowLeft") {
                          e.preventDefault();
                          onChangeDueDate(r.id, addDaysYmd(r.dueDate!, -1));
                        } else if (e.key === "ArrowRight") {
                          e.preventDefault();
                          onChangeDueDate(r.id, addDaysYmd(r.dueDate!, 1));
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
