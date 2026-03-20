import type { BoardData } from "@/lib/kv-boards";
import { computeKeyResultProgress, type OkrsKeyResultDefinition, type OkrsMetricType } from "@/lib/okr-engine";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** Projeção linear considera risco quando o % previsto ao fim do quarter fica abaixo deste valor. */
export const OKR_RISK_PROJECTED_PCT_THRESHOLD = 80;

export type OkrProjectionVelocitySource = "copilot_last_4_weeks" | "no_velocity";

export type OkrKrProjection = {
  keyResultId: string;
  objectiveId: string;
  krTitle: string;
  objectiveTitle: string;
  owner: string | null;
  quarter: string;
  metricType: OkrsMetricType;
  linkedBoardId: string;
  current: number;
  target: number;
  pct: number;
  linkBroken?: boolean;
  /** Média de conclusões/semana (board vinculado, Copilot, últimas 4 janelas). */
  avgWeeklyThroughput: number;
  weekConcludedSamples: number[];
  weeksUntilQuarterEnd: number;
  projectedValueAtQuarterEnd: number;
  projectedPctAtQuarterEnd: number;
  riskBelowThreshold: boolean;
  velocitySource: OkrProjectionVelocitySource;
  /** Data estimada de atingir 100% do target, se ritmo atual se mantiver. */
  etaReachTargetMs: number | null;
  /** Positivo = semanas antes do fim do quarter; negativo = não atinge no quarter. */
  etaWeeksVsQuarterEnd: number | null;
  /** Cards “parados” na coluna do KR (quando aplicável). */
  stuckInColumnOver7d: number | null;
  summaryLine: string;
  detailLine: string;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Formato usado no app: `YYYY-Qn` (ex.: `2025-Q1`). */
export function parseQuarterEndMs(quarter: string): number | null {
  const m = /^(\d{4})-Q([1-4])$/.exec(String(quarter || "").trim());
  if (!m) return null;
  const year = Number(m[1]);
  const q = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(q)) return null;
  const end = new Date(year, q * 3, 0);
  end.setHours(23, 59, 59, 999);
  return end.getTime();
}

export function countCardsStuckInColumn(
  board: BoardData,
  columnKey: string,
  minDays: number,
  nowMs: number
): number {
  const cards = Array.isArray(board.cards) ? board.cards : [];
  let n = 0;
  for (const raw of cards) {
    if (!raw || typeof raw !== "object") continue;
    const c = raw as Record<string, unknown>;
    if (String(c.bucket || "") !== columnKey) continue;
    if (String(c.progress || "") === "Concluída") continue;
    const entered = typeof c.columnEnteredAt === "string" ? c.columnEnteredAt : null;
    if (!entered) continue;
    const t = new Date(entered).getTime();
    if (Number.isNaN(t)) continue;
    const days = (nowMs - t) / DAY_MS;
    if (days >= minDays) n++;
  }
  return n;
}

function formatShortDatePt(ms: number): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(ms));
}

export function computeKrLinearProjection(args: {
  keyResult: OkrsKeyResultDefinition;
  objectiveTitle: string;
  owner: string | null;
  quarter: string;
  computedPct: number;
  computedCurrent: number;
  linkBroken?: boolean;
  weekConcludedCounts: number[];
  nowMs: number;
  quarterEndMs: number;
  stuckInColumnOver7d: number | null;
}): OkrKrProjection {
  const {
    keyResult,
    objectiveTitle,
    owner,
    quarter,
    computedPct,
    computedCurrent,
    linkBroken,
    weekConcludedCounts,
    nowMs,
    quarterEndMs,
    stuckInColumnOver7d,
  } = args;

  const target = keyResult.target;
  const krTitle = keyResult.title;
  const metricType = keyResult.metric_type;

  const weeksRaw = (quarterEndMs - nowMs) / WEEK_MS;
  const weeksUntilQuarterEnd = Math.max(0, weeksRaw);

  const sumWeeks = weekConcludedCounts.reduce((a, b) => a + b, 0);
  const avgWeeklyThroughput = weekConcludedCounts.length ? sumWeeks / weekConcludedCounts.length : 0;

  const manualOrBroken =
    metricType === "Manual" || Boolean(linkBroken);

  let velocitySource: OkrProjectionVelocitySource = "copilot_last_4_weeks";
  let projectedValueAtQuarterEnd = computedCurrent;
  let etaReachTargetMs: number | null = null;
  let etaWeeksVsQuarterEnd: number | null = null;

  if (manualOrBroken) {
    velocitySource = "no_velocity";
    projectedValueAtQuarterEnd = computedCurrent;
    etaReachTargetMs = null;
    etaWeeksVsQuarterEnd = null;
  } else if (avgWeeklyThroughput <= 0) {
    velocitySource = "no_velocity";
    projectedValueAtQuarterEnd = computedCurrent;
    etaReachTargetMs = null;
    etaWeeksVsQuarterEnd = null;
  } else {
    const remaining = Math.max(0, target - computedCurrent);
    projectedValueAtQuarterEnd = computedCurrent + avgWeeklyThroughput * weeksUntilQuarterEnd;
    if (computedCurrent < target) {
      const weeksToTarget = remaining / avgWeeklyThroughput;
      etaReachTargetMs = nowMs + weeksToTarget * WEEK_MS;
      etaWeeksVsQuarterEnd = (quarterEndMs - etaReachTargetMs) / WEEK_MS;
    } else {
      etaReachTargetMs = nowMs;
      etaWeeksVsQuarterEnd = (quarterEndMs - nowMs) / WEEK_MS;
    }
  }

  const projectedPctAtQuarterEnd =
    !Number.isFinite(target) || target <= 0
      ? 0
      : clamp(Math.round((projectedValueAtQuarterEnd / target) * 100), 0, 100);

  const riskBelowThreshold =
    !manualOrBroken &&
    avgWeeklyThroughput > 0 &&
    computedCurrent < target &&
    projectedPctAtQuarterEnd < OKR_RISK_PROJECTED_PCT_THRESHOLD;

  let summaryLine = "";
  let detailLine = "";

  if (manualOrBroken) {
    if (metricType === "Manual") {
      summaryLine = "Métrica manual: projeção automática por throughput não se aplica.";
      detailLine = "Atualize o valor atual do KR para acompanhar o quarter.";
    } else {
      summaryLine = "Coluna vinculada ausente; corrija o KR para habilitar projeção.";
      detailLine = "Sem vínculo válido com o board.";
    }
  } else if (avgWeeklyThroughput <= 0) {
    summaryLine =
      "Sem throughput de conclusões (Copilot) nas últimas 4 semanas no board vinculado; projeção assume ritmo 0.";
    detailLine =
      "Dica: movimente/conclua cards pelo Copilot ou aguarde histórico para a projeção linear ganhar sinal.";
  } else if (computedCurrent >= target) {
    summaryLine = "Meta do KR já atingida.";
    detailLine = `Ritmo médio: ${avgWeeklyThroughput.toFixed(1)} conclusões/semana (últimas 4 semanas).`;
  } else {
    const deficit = Math.max(0, Math.ceil(target - projectedValueAtQuarterEnd));
    if (etaReachTargetMs !== null && etaReachTargetMs <= quarterEndMs && etaWeeksVsQuarterEnd !== null) {
      const ahead = etaWeeksVsQuarterEnd;
      if (ahead >= 0.5) {
        summaryLine = `ETA: ${formatShortDatePt(etaReachTargetMs)} (~${Math.round(ahead)} sem. antes do fim do quarter).`;
      } else {
        summaryLine = `ETA: ${formatShortDatePt(etaReachTargetMs)} (próximo ao prazo do quarter).`;
      }
    } else if (projectedPctAtQuarterEnd < 100) {
      summaryLine = `Projeção: ~${projectedPctAtQuarterEnd}% ao fim do quarter${deficit ? ` — déficit de ~${deficit} card(s)` : ""}.`;
    } else {
      summaryLine = `Projeção: meta atingível (~${projectedPctAtQuarterEnd}% ao fim do quarter).`;
    }

    const stuckPart =
      typeof stuckInColumnOver7d === "number" && stuckInColumnOver7d > 0 && keyResult.metric_type === "card_in_column"
        ? ` ${stuckInColumnOver7d} card(s) parados na coluna há >7 dias.`
        : "";
    detailLine = `Ritmo médio: ${avgWeeklyThroughput.toFixed(1)} conclusões/semana (board).${stuckPart}`;
    if (riskBelowThreshold) {
      summaryLine = `⚠️ ${summaryLine}`;
    }
  }

  return {
    keyResultId: keyResult.id,
    objectiveId: keyResult.objectiveId,
    krTitle,
    objectiveTitle,
    owner,
    quarter,
    metricType,
    linkedBoardId: keyResult.linkedBoardId,
    current: computedCurrent,
    target,
    pct: computedPct,
    linkBroken,
    avgWeeklyThroughput,
    weekConcludedSamples: [...weekConcludedCounts],
    weeksUntilQuarterEnd,
    projectedValueAtQuarterEnd,
    projectedPctAtQuarterEnd,
    riskBelowThreshold,
    velocitySource,
    etaReachTargetMs,
    etaWeeksVsQuarterEnd,
    stuckInColumnOver7d,
    summaryLine,
    detailLine,
  };
}

export function buildKrDefinitionFromKv(kr: {
  id: string;
  objectiveId: string;
  title: string;
  metric_type: OkrsMetricType;
  target: number;
  linkedBoardId: string;
  linkedColumnKey?: string | null;
  manualCurrent?: number | null;
}): OkrsKeyResultDefinition {
  return {
    id: kr.id,
    objectiveId: kr.objectiveId,
    title: kr.title,
    metric_type: kr.metric_type,
    target: kr.target,
    linkedBoardId: kr.linkedBoardId,
    linkedColumnKey: kr.linkedColumnKey,
    manualCurrent: kr.manualCurrent,
  };
}

export function buildProjectionsForObjectives(args: {
  grouped: Array<{
    objective: { id: string; title: string; owner?: string | null; quarter: string };
    keyResults: Array<{
      id: string;
      objectiveId: string;
      title: string;
      metric_type: OkrsMetricType;
      target: number;
      linkedBoardId: string;
      linkedColumnKey?: string | null;
      manualCurrent?: number | null;
    }>;
  }>;
  boardById: Map<string, BoardData>;
  weekConcludedByBoardId: Map<string, number[]>;
  nowMs: number;
}): OkrKrProjection[] {
  const { grouped, boardById, weekConcludedByBoardId, nowMs } = args;
  const out: OkrKrProjection[] = [];

  for (const g of grouped) {
    const o = g.objective;
    const qEnd = parseQuarterEndMs(o.quarter);
    if (qEnd === null) continue;

    for (const kr of g.keyResults) {
      const def = buildKrDefinitionFromKv(kr);
      const board = boardById.get(kr.linkedBoardId);
      const cards =
        board && Array.isArray(board.cards) ? (board.cards as Array<{ bucket?: string | null }>) : [];
      const bucketKeys = board ? bucketKeysFromBoard(board) : undefined;
      const comp = computeKeyResultProgress({
        cards,
        keyResult: def,
        bucketKeys,
      });

      let stuck: number | null = null;
      if (
        kr.metric_type === "card_in_column" &&
        board &&
        typeof kr.linkedColumnKey === "string" &&
        kr.linkedColumnKey
      ) {
        stuck = countCardsStuckInColumn(board, kr.linkedColumnKey, 7, nowMs);
      }

      const weeks = weekConcludedByBoardId.get(kr.linkedBoardId) ?? [0, 0, 0, 0];

      out.push(
        computeKrLinearProjection({
          keyResult: def,
          objectiveTitle: o.title,
          owner: o.owner ?? null,
          quarter: o.quarter,
          computedPct: comp.pct,
          computedCurrent: comp.current,
          linkBroken: comp.linkBroken,
          weekConcludedCounts: weeks,
          nowMs,
          quarterEndMs: qEnd,
          stuckInColumnOver7d: stuck,
        })
      );
    }
  }

  return out;
}

function bucketKeysFromBoard(board: BoardData): Set<string> {
  const order = Array.isArray(board.config?.bucketOrder) ? board.config!.bucketOrder! : [];
  const keys = new Set<string>();
  for (const b of order) {
    if (b && typeof b === "object") {
      const k = String((b as { key?: string }).key || "").trim();
      if (k) keys.add(k);
    }
  }
  return keys;
}
