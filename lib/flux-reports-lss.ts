import type { BoardData } from "@/lib/kv-boards";
import {
  buildRollingWeekRanges,
  parseCardFlowStartMs,
  type FluxWeekRange,
} from "@/lib/flux-reports-metrics";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Colunas padrão DMAIC em boards LSS (`lib/board-methodology`). */
export const LSS_DMAIC_KEYS = ["define", "measure", "analyze", "improve", "control"] as const;
export type LssDmaicKey = (typeof LSS_DMAIC_KEYS)[number];

const DEFAULT_DMAIC_LABELS: Record<LssDmaicKey, string> = {
  define: "Define",
  measure: "Measure",
  analyze: "Analyze",
  improve: "Improve",
  control: "Control",
};

/** Aging em dias (WIP aberto) acima disto conta como “em risco” para C-level. */
export const LSS_AGING_AT_RISK_DAYS = 21;

export function filterLeanSixSigmaBoards(boards: BoardData[]): BoardData[] {
  return boards.filter((b) => b.boardMethodology === "lean_six_sigma");
}

function bucketKeyLabelMap(board: BoardData): Map<string, string> {
  const map = new Map<string, string>();
  const order = Array.isArray(board.config?.bucketOrder) ? board.config!.bucketOrder! : [];
  for (const b of order) {
    if (b && typeof b === "object") {
      const rec = b as Record<string, unknown>;
      const key = String(rec.key || "");
      if (!key) continue;
      map.set(key, String(rec.label || rec.key || key));
    }
  }
  return map;
}

function dmaicLabelsMerged(boards: BoardData[]): Map<LssDmaicKey, string> {
  const out = new Map<LssDmaicKey, string>();
  for (const k of LSS_DMAIC_KEYS) {
    out.set(k, DEFAULT_DMAIC_LABELS[k]);
  }
  for (const board of boards) {
    const bmap = bucketKeyLabelMap(board);
    for (const k of LSS_DMAIC_KEYS) {
      const lbl = bmap.get(k);
      if (lbl && lbl.trim()) out.set(k, lbl.trim());
    }
  }
  return out;
}

function cardIsOpen(card: unknown): boolean {
  if (!card || typeof card !== "object") return false;
  return String((card as Record<string, unknown>).progress || "") !== "Concluída";
}

function parseCompletedMs(card: unknown): number | null {
  if (!card || typeof card !== "object") return null;
  const raw = (card as Record<string, unknown>).completedAt;
  if (typeof raw !== "string") return null;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Distribuição de cards abertos por fase DMAIC (bucket key). */
export function buildLssDmaicOpenDistribution(boards: BoardData[]): Array<{ key: string; label: string; count: number }> {
  const labels = dmaicLabelsMerged(boards);
  const counts: Record<string, number> = {};
  for (const k of LSS_DMAIC_KEYS) counts[k] = 0;

  for (const board of boards) {
    const cards = Array.isArray(board.cards) ? board.cards : [];
    for (const card of cards) {
      if (!cardIsOpen(card)) continue;
      const bk = String((card as Record<string, unknown>).bucket || "");
      if (Object.prototype.hasOwnProperty.call(counts, bk)) counts[bk]++;
    }
  }

  return LSS_DMAIC_KEYS.map((key) => ({
    key,
    label: labels.get(key) ?? DEFAULT_DMAIC_LABELS[key],
    count: counts[key] ?? 0,
  }));
}

export type LssBoardRow = {
  boardId: string;
  name: string;
  clientLabel: string | null;
  openCount: number;
  openAtRiskCount: number;
  maxOpenAgingDays: number;
  cardsByPhase: Record<LssDmaicKey, number>;
  phaseLabels: Record<LssDmaicKey, string>;
};

export function buildLssBoardRows(boards: BoardData[]): LssBoardRow[] {
  const now = Date.now();
  const rows: LssBoardRow[] = [];

  for (const board of boards) {
    const bmap = bucketKeyLabelMap(board);
    const phaseLabels = { ...DEFAULT_DMAIC_LABELS };
    for (const k of LSS_DMAIC_KEYS) {
      const lbl = bmap.get(k);
      if (lbl?.trim()) phaseLabels[k] = lbl.trim();
    }

    const cards = Array.isArray(board.cards) ? board.cards : [];
    let openCount = 0;
    let openAtRiskCount = 0;
    let maxOpenAgingDays = 0;
    const byPhase: Record<LssDmaicKey, number> = {
      define: 0,
      measure: 0,
      analyze: 0,
      improve: 0,
      control: 0,
    };

    for (const card of cards) {
      if (!cardIsOpen(card)) continue;
      openCount++;
      const bk = String((card as Record<string, unknown>).bucket || "");
      if (bk in byPhase) byPhase[bk as LssDmaicKey]++;

      const start = parseCardFlowStartMs(card, board);
      const ageDays = start !== null ? Math.max(0, Math.floor((now - start) / DAY_MS)) : 0;
      if (ageDays > maxOpenAgingDays) maxOpenAgingDays = ageDays;
      if (ageDays >= LSS_AGING_AT_RISK_DAYS) openAtRiskCount++;
    }

    rows.push({
      boardId: board.id,
      name: board.name,
      clientLabel: board.clientLabel ?? null,
      openCount,
      openAtRiskCount,
      maxOpenAgingDays,
      cardsByPhase: byPhase,
      phaseLabels,
    });
  }

  return rows.sort(
    (a, b) => b.openAtRiskCount - a.openAtRiskCount || b.maxOpenAgingDays - a.maxOpenAgingDays || b.openCount - a.openCount
  );
}

export function buildLssWeeklyCompletions(
  boards: BoardData[],
  weeks: FluxWeekRange[]
): Array<{ weekLabel: string; concluded: number }> {
  return weeks.map((w) => {
    let concluded = 0;
    for (const board of boards) {
      const cards = Array.isArray(board.cards) ? board.cards : [];
      for (const card of cards) {
        const cm = parseCompletedMs(card);
        if (cm === null) continue;
        if (cm >= w.startMs && cm < w.endMs) concluded++;
      }
    }
    return { weekLabel: w.label, concluded };
  });
}

export function buildLssAgingHistogram(boards: BoardData[]): Array<{ label: string; count: number }> {
  const bins = [
    { max: 7, label: "0–7d" },
    { max: 14, label: "8–14d" },
    { max: 21, label: "15–21d" },
    { max: Infinity, label: "22d+" },
  ];
  const counts = bins.map(() => 0);
  const now = Date.now();

  for (const board of boards) {
    const cards = Array.isArray(board.cards) ? board.cards : [];
    for (const card of cards) {
      if (!cardIsOpen(card)) continue;
      const start = parseCardFlowStartMs(card, board);
      const ageDays = start !== null ? Math.max(0, Math.floor((now - start) / DAY_MS)) : 0;
      let idx = bins.findIndex((b) => ageDays <= b.max);
      if (idx < 0) idx = bins.length - 1;
      counts[idx]++;
    }
  }

  return bins.map((b, i) => ({ label: b.label, count: counts[i] }));
}

export type FluxReportsLssPayload = {
  schema: string;
  generatedAt: string;
  boardCount: number;
  dmaicOpenDistribution: Array<{ key: string; label: string; count: number }>;
  boards: LssBoardRow[];
  weeklyCompletions: Array<{ weekLabel: string; concluded: number }>;
  agingOpenWork: Array<{ label: string; count: number }>;
  totals: {
    openWorkItems: number;
    boardsWithOpenWork: number;
    atRiskOpenItems: number;
    concludedLast8Weeks: number;
  };
  okrHints?: Array<{ objectiveId: string; objectiveTitle: string; krTitle: string; boardId: string }>;
};

export function buildFluxReportsLssPayload(
  boards: BoardData[],
  opts?: { okrHints?: FluxReportsLssPayload["okrHints"] }
): FluxReportsLssPayload {
  const lss = filterLeanSixSigmaBoards(boards);
  const nowMs = Date.now();
  const weeks = buildRollingWeekRanges(8, nowMs);
  const weeklyCompletions = buildLssWeeklyCompletions(lss, weeks);
  const dmaicOpenDistribution = buildLssDmaicOpenDistribution(lss);
  const boardRows = buildLssBoardRows(lss);
  const agingOpenWork = buildLssAgingHistogram(lss);

  let openWorkItems = 0;
  let atRiskOpenItems = 0;
  for (const row of boardRows) {
    openWorkItems += row.openCount;
    atRiskOpenItems += row.openAtRiskCount;
  }
  const boardsWithOpenWork = boardRows.filter((r) => r.openCount > 0).length;
  const concludedLast8Weeks = weeklyCompletions.reduce((acc, w) => acc + w.concluded, 0);

  return {
    schema: "flux-board.flux_reports_lss.v1",
    generatedAt: new Date().toISOString(),
    boardCount: lss.length,
    dmaicOpenDistribution,
    boards: boardRows,
    weeklyCompletions,
    agingOpenWork,
    totals: {
      openWorkItems,
      boardsWithOpenWork,
      atRiskOpenItems,
      concludedLast8Weeks,
    },
    ...(opts?.okrHints?.length ? { okrHints: opts.okrHints } : {}),
  };
}

export type LeanSixSigmaPortfolioSummary = {
  boardCount: number;
  openWorkItems: number;
  atRiskOpenItems: number;
  dmaicOpenDistribution: Array<{ key: string; label: string; count: number }>;
  topBoardsAtRisk: Array<{
    id: string;
    name: string;
    openAtRiskCount: number;
    maxOpenAgingDays: number;
  }>;
};

export function buildLeanSixSigmaPortfolioSummary(boards: BoardData[]): LeanSixSigmaPortfolioSummary | null {
  const lss = filterLeanSixSigmaBoards(boards);
  if (!lss.length) return null;
  const payload = buildFluxReportsLssPayload(boards);
  return {
    boardCount: payload.boardCount,
    openWorkItems: payload.totals.openWorkItems,
    atRiskOpenItems: payload.totals.atRiskOpenItems,
    dmaicOpenDistribution: payload.dmaicOpenDistribution,
    topBoardsAtRisk: payload.boards.slice(0, 5).map((b) => ({
      id: b.boardId,
      name: b.name,
      openAtRiskCount: b.openAtRiskCount,
      maxOpenAgingDays: b.maxOpenAgingDays,
    })),
  };
}
