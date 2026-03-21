/**
 * CFD diário: lê snapshots em `anomaly_daily_snapshots` (wip por coluna + doneCount),
 * gravados pelo cron GET /api/cron/anomaly-check — equivalente ao histórico “board_daily” pedido no produto.
 */
import type { Db } from "mongodb";
import type { BoardData } from "@/lib/kv-boards";
import { COL_ANOMALY_SNAPSHOTS } from "@/lib/anomaly-collections";
import { collectBucketLabels } from "@/lib/flux-reports-metrics";

const DAY_MS = 24 * 60 * 60 * 1000;

export type CfdDailyPeriodDays = 14 | 30 | 90;

export function parseCfdDailyPeriod(raw: string | null): CfdDailyPeriodDays {
  const n = Number.parseInt(String(raw ?? "14"), 10);
  if (Number.isNaN(n)) return 14;
  if (n <= 14) return 14;
  if (n <= 30) return 30;
  return 90;
}

export function dayKeyUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Dias corridos [fromDay, toDay] inclusive (UTC). */
export function enumerateDaysInclusive(fromDay: string, toDay: string): string[] {
  const out: string[] = [];
  const start = Date.parse(`${fromDay}T12:00:00.000Z`);
  const end = Date.parse(`${toDay}T12:00:00.000Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || start > end) return out;
  for (let t = start; t <= end; t += DAY_MS) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/** Ordem das colunas no CFD: ordem do bucketOrder dos boards; depois __done__. */
export function collectCfdKeyOrder(boards: BoardData[]): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const board of boards) {
    const order = Array.isArray(board.config?.bucketOrder) ? board.config!.bucketOrder! : [];
    for (const b of order) {
      if (b && typeof b === "object") {
        const rec = b as Record<string, unknown>;
        const k = String(rec.key || "");
        if (!k || seen.has(k)) continue;
        seen.add(k);
        ordered.push(k);
      }
    }
  }
  return ordered;
}

export function collectBucketColors(boards: BoardData[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const board of boards) {
    const order = Array.isArray(board.config?.bucketOrder) ? board.config!.bucketOrder! : [];
    for (const b of order) {
      if (b && typeof b === "object") {
        const rec = b as Record<string, unknown>;
        const k = String(rec.key || "");
        if (!k || map.has(k)) continue;
        const c = rec.color;
        if (typeof c === "string" && c.trim()) map.set(k, c.trim());
      }
    }
  }
  return map;
}

export function mergeSnapshotsIntoByDay(
  rows: Array<{ day?: string; wipByBucket?: Record<string, number>; doneCount?: number }>
): Map<string, Record<string, number>> {
  const byDay = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const d = typeof r.day === "string" ? r.day : "";
    if (!d) continue;
    let acc = byDay.get(d);
    if (!acc) {
      acc = {};
      byDay.set(d, acc);
    }
    const wip = r.wipByBucket ?? {};
    for (const [k, v] of Object.entries(wip)) {
      const n = typeof v === "number" && !Number.isNaN(v) ? v : 0;
      acc[k] = (acc[k] ?? 0) + n;
    }
    const done = typeof r.doneCount === "number" && !Number.isNaN(r.doneCount) ? r.doneCount : 0;
    acc.__done__ = (acc.__done__ ?? 0) + done;
  }
  return byDay;
}

function formatDayLabel(day: string): string {
  const parts = day.split("-");
  if (parts.length !== 3) return day;
  const d = Number(parts[2]);
  const m = Number(parts[1]);
  if (!Number.isFinite(d) || !Number.isFinite(m)) return day;
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

export function buildCfdDailyChartRows(args: {
  keys: string[];
  byDayRaw: Map<string, Record<string, number>>;
  allDays: string[];
}): { rows: Array<Record<string, string | number>>; distinctSnapshotDays: number } {
  const { keys, byDayRaw, allDays } = args;
  const distinctSnapshotDays = byDayRaw.size;
  let last: Record<string, number> | null = null;
  const rows: Array<Record<string, string | number>> = [];

  for (const day of allDays) {
    const snap = byDayRaw.get(day);
    if (snap) {
      last = { ...snap };
    }
    const base = last ?? {};
    const row: Record<string, string | number> = {
      day,
      dayLabel: formatDayLabel(day),
    };
    for (const k of keys) {
      const v = base[k];
      row[k] = typeof v === "number" && !Number.isNaN(v) ? v : 0;
    }
    rows.push(row);
  }

  return { rows, distinctSnapshotDays };
}

/** WIP = soma das colunas exceto concluídos; tendência de subida no período. */
export function detectWipRising(rows: Array<Record<string, string | number>>, keys: string[]): boolean {
  if (rows.length < 6) return false;
  const wipKeys = keys.filter((k) => k !== "__done__");
  if (wipKeys.length === 0) return false;

  const totals = rows.map((r) =>
    wipKeys.reduce((s, k) => s + (typeof r[k] === "number" ? (r[k] as number) : 0), 0)
  );

  const n = totals.length;
  const chunk = Math.max(2, Math.floor(n / 3));
  const firstAvg = totals.slice(0, chunk).reduce((a, b) => a + b, 0) / chunk;
  const lastAvg = totals.slice(n - chunk).reduce((a, b) => a + b, 0) / chunk;

  if (firstAvg < 0.5) return lastAvg >= 3 && lastAvg > firstAvg + 0.5;
  return lastAvg > firstAvg * 1.05;
}

export async function loadCfdDailySnapshotsForBoards(args: {
  db: Db;
  orgId: string;
  boardIds: string[];
  fromDay: string;
  toDay: string;
}): Promise<Array<{ day: string; wipByBucket?: Record<string, number>; doneCount?: number }>> {
  const { db, orgId, boardIds, fromDay, toDay } = args;
  if (!boardIds.length) return [];

  const docs = await db
    .collection(COL_ANOMALY_SNAPSHOTS)
    .find(
      { orgId, boardId: { $in: boardIds }, day: { $gte: fromDay, $lte: toDay } },
      { projection: { _id: 0, day: 1, wipByBucket: 1, doneCount: 1 } }
    )
    .toArray();

  return docs.map((d) => ({
    day: String((d as { day?: string }).day ?? ""),
    wipByBucket: (d as { wipByBucket?: Record<string, number> }).wipByBucket,
    doneCount: (d as { doneCount?: number }).doneCount,
  }));
}

let indexesEnsured = false;

export async function ensureCfdDailySnapshotIndexes(db: Db): Promise<void> {
  if (indexesEnsured) return;
  await db.collection(COL_ANOMALY_SNAPSHOTS).createIndex({ orgId: 1, day: 1, boardId: 1 });
  indexesEnsured = true;
}

/** Inclui colunas presentes nos snapshots mas fora do bucketOrder; `__done__` sempre por último. */
export function normalizeCfdKeys(orderedKeys: string[], byDayRaw: Map<string, Record<string, number>>): string[] {
  const ordered = orderedKeys.filter((k) => k !== "__done__");
  const extra = new Set<string>();
  for (const rec of byDayRaw.values()) {
    for (const k of Object.keys(rec)) {
      if (k === "__done__") continue;
      if (!ordered.includes(k)) extra.add(k);
    }
  }
  const extrasSorted = [...extra].sort((a, b) => a.localeCompare(b));
  return [...ordered, ...extrasSorted, "__done__"];
}

const FALLBACK_AREA_COLORS = [
  "var(--flux-primary)",
  "var(--flux-secondary)",
  "var(--flux-warning-foreground)",
  "var(--flux-danger)",
  "var(--flux-primary-light)",
  "var(--flux-success)",
  "var(--flux-accent-dark)",
  "var(--flux-info)",
];

export function buildCfdDailyMeta(boards: BoardData[], keys: string[]) {
  const labels = collectBucketLabels(boards);
  const labelMap: Record<string, string> = {};
  const colorsMap = collectBucketColors(boards);
  const colors: Record<string, string> = {};
  let fb = 0;
  for (const k of keys) {
    labelMap[k] = k === "__done__" ? "Concluídos" : labels.get(k) ?? k;
    if (k === "__done__") {
      colors[k] = "var(--flux-success)";
    } else if (colorsMap.has(k)) {
      colors[k] = colorsMap.get(k)!;
    } else {
      colors[k] = FALLBACK_AREA_COLORS[fb % FALLBACK_AREA_COLORS.length];
      fb++;
    }
  }
  return { keys, labels: labelMap, colors };
}
