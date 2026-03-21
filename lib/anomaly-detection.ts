import type { BoardData } from "@/lib/kv-boards";
import {
  averageLeadTimeDays,
  buildRollingWeekRanges,
  buildWeeklyThroughputFromCopilot,
  collectBucketLabels,
  type CopilotChatDocLike,
} from "@/lib/flux-reports-metrics";
import type { OkrKrProjection } from "@/lib/okr-projection";

export type AnomalyKind =
  | "throughput_drop"
  | "wip_explosion"
  | "lead_time_spike"
  | "stagnation_cluster"
  | "okr_drift"
  | "overdue_cascade"
  | "cross_board_blocker_overdue";

export type AnomalySeverity = "info" | "warning" | "critical";

export type AnomalyAlertPayload = {
  kind: AnomalyKind;
  severity: AnomalySeverity;
  title: string;
  message: string;
  diagnostics: Record<string, unknown>;
  boardId?: string;
  boardName?: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function mean(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** Desvio padrão amostral (n−1); retorna null se n < 2 ou variância zero. */
export function sampleStd(nums: number[]): number | null {
  if (nums.length < 2) return null;
  const m = mean(nums);
  if (m === null) return null;
  const v = nums.reduce((acc, x) => acc + (x - m) * (x - m), 0) / (nums.length - 1);
  const s = Math.sqrt(Math.max(0, v));
  return s > 1e-9 ? s : null;
}

export function zScore(value: number, baseline: number[]): { z: number; mean: number; std: number } | null {
  const m = mean(baseline);
  const s = sampleStd(baseline);
  if (m === null || s === null) return null;
  return { z: (value - m) / s, mean: m, std: s };
}

function daysUntilDueLocal(dueDate: string, todayMs: number): number | null {
  const due = new Date(`${String(dueDate).trim()}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date(todayMs);
  today.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / DAY_MS);
}

export function countDueWithinDays(boards: BoardData[], maxDaysInclusive: number, todayMs: number): number {
  let n = 0;
  for (const board of boards) {
    const cards = Array.isArray(board.cards) ? board.cards : [];
    for (const raw of cards) {
      if (!raw || typeof raw !== "object") continue;
      const c = raw as Record<string, unknown>;
      if (String(c.progress || "") === "Concluída") continue;
      const due = c.dueDate;
      if (!due || typeof due !== "string") continue;
      const d = daysUntilDueLocal(due, todayMs);
      if (d === null) continue;
      if (d >= 0 && d <= maxDaysInclusive) n++;
    }
  }
  return n;
}

export function countStagnantCards(board: BoardData, minDays: number, nowMs: number): number {
  const cards = Array.isArray(board.cards) ? board.cards : [];
  let n = 0;
  for (const raw of cards) {
    if (!raw || typeof raw !== "object") continue;
    const c = raw as Record<string, unknown>;
    if (String(c.progress || "") === "Concluída") continue;
    const entered = typeof c.columnEnteredAt === "string" ? c.columnEnteredAt : null;
    if (!entered) continue;
    const t = new Date(entered).getTime();
    if (Number.isNaN(t)) continue;
    if ((nowMs - t) / DAY_MS >= minDays) n++;
  }
  return n;
}

export type WipByBucket = Record<string, number>;

export function computeWipByBucket(board: BoardData): WipByBucket {
  const out: WipByBucket = {};
  const cards = Array.isArray(board.cards) ? board.cards : [];
  for (const raw of cards) {
    if (!raw || typeof raw !== "object") continue;
    const c = raw as Record<string, unknown>;
    if (String(c.progress || "") === "Concluída") continue;
    const bk = String(c.bucket || "unknown");
    out[bk] = (out[bk] ?? 0) + 1;
  }
  return out;
}

/** Contagem de cards concluídos (para CFD diário: faixa “Concluídos” empilhada). */
export function countDoneCards(board: BoardData): number {
  const cards = Array.isArray(board.cards) ? board.cards : [];
  let n = 0;
  for (const raw of cards) {
    if (!raw || typeof raw !== "object") continue;
    const c = raw as Record<string, unknown>;
    if (String(c.progress || "") === "Concluída") n++;
  }
  return n;
}

export function detectThroughputDrop(args: {
  copilotChats: CopilotChatDocLike[];
  boardIds: string[];
  nowMs: number;
}): AnomalyAlertPayload | null {
  const { copilotChats, boardIds, nowMs } = args;
  if (!boardIds.length) return null;
  const weeks = buildRollingWeekRanges(5, nowMs);
  if (weeks.length < 5) return null;
  const series = buildWeeklyThroughputFromCopilot(copilotChats, boardIds, weeks);
  const baseline = series.slice(0, 4).map((s) => s.concluded);
  const current = series[4]?.concluded ?? 0;
  const sumBase = baseline.reduce((a, b) => a + b, 0);
  if (sumBase === 0 && current === 0) return null;

  const m = mean(baseline);
  if (m === null || m <= 0) {
    if (current === 0 && sumBase > 0) {
      return {
        kind: "throughput_drop",
        severity: "warning",
        title: "Queda forte de throughput",
        message: `Nenhuma conclusão na última semana (Copilot), após histórico recente nas semanas anteriores.`,
        diagnostics: {
          currentWeek: current,
          baselineWeeks: baseline,
          zScore: null,
          note: "Baseline média zero ou inexistente; alerta por queda a zero.",
        },
      };
    }
    return null;
  }

  const zs = zScore(current, baseline);
  const dropRatio = current / m;
  const pctDrop = Math.round((1 - dropRatio) * 100);

  if (zs && zs.z < -2 && current < m) {
    return {
      kind: "throughput_drop",
      severity: zs.z < -2.5 ? "critical" : "warning",
      title: "Throughput abaixo do esperado",
      message: `Throughput semanal caiu para ${current} concluídos vs. média ${m.toFixed(1)} nas 4 semanas anteriores (z ≈ ${zs.z.toFixed(2)}).`,
      diagnostics: {
        zScore: zs.z,
        mean: zs.mean,
        std: zs.std,
        currentWeek: current,
        baselineWeeks: baseline,
      },
    };
  }

  if (pctDrop >= 40 && current < m) {
    return {
      kind: "throughput_drop",
      severity: "warning",
      title: "Queda relevante de throughput",
      message: `Queda de ~${pctDrop}% no throughput vs. a média das 4 semanas anteriores (${current} vs. ${m.toFixed(1)}).`,
      diagnostics: {
        pctDrop,
        currentWeek: current,
        baselineMean: m,
        baselineWeeks: baseline,
        zScore: zs?.z ?? null,
      },
    };
  }

  return null;
}

export function detectLeadTimeSpike(args: {
  boards: BoardData[];
  historyLeadAvgs: number[];
}): AnomalyAlertPayload | null {
  const { boards, historyLeadAvgs } = args;
  const current = averageLeadTimeDays(boards);
  if (current === null) return null;
  const usable = historyLeadAvgs.filter((x) => Number.isFinite(x) && x > 0);
  if (usable.length < 3) return null;
  const zs = zScore(current, usable);
  if (!zs || zs.z < 2) return null;
  return {
    kind: "lead_time_spike",
    severity: zs.z > 2.5 ? "warning" : "info",
    title: "Lead time acima do padrão recente",
    message: `Lead time médio (~${current} dias) está ${zs.z.toFixed(1)} desvios acima da linha de base dos últimos registros diários.`,
    diagnostics: {
      zScore: zs.z,
      current: current,
      baselineMean: zs.mean,
      baselineStd: zs.std,
      historySamples: usable.length,
    },
  };
}

export function detectWipExplosionForBoard(args: {
  board: BoardData;
  bucketLabels: Map<string, string>;
  historyForBoard: WipByBucket[];
}): AnomalyAlertPayload | null {
  const { board, bucketLabels, historyForBoard } = args;
  const current = computeWipByBucket(board);
  const keys = Object.keys(current).filter((k) => (current[k] ?? 0) > 0);
  if (!keys.length) return null;

  for (const key of keys) {
    const count = current[key] ?? 0;
    if (count < 3) continue;
    const series = historyForBoard.map((h) => h[key] ?? 0);
    if (series.length < 4) continue;
    const zs = zScore(count, series);
    const m = mean(series);
    if (m === null || m <= 0) continue;
    const ratio = count / m;
    if (zs && zs.z > 2.5 && ratio >= 2) {
      const label = bucketLabels.get(key) ?? key;
      return {
        kind: "wip_explosion",
        severity: ratio >= 3 && count >= 5 ? "critical" : "warning",
        title: "WIP elevado na coluna",
        message: `Coluna “${label}” tem ${count} cards — ~${ratio.toFixed(1)}× a média recente (z ≈ ${zs.z.toFixed(2)}).`,
        diagnostics: {
          zScore: zs.z,
          columnKey: key,
          columnLabel: label,
          current: count,
          baselineMean: m,
          baselineStd: zs.std,
        },
        boardId: board.id,
        boardName: board.name,
      };
    }
    if (ratio >= 3 && count >= 5) {
      const label = bucketLabels.get(key) ?? key;
      return {
        kind: "wip_explosion",
        severity: "critical",
        title: "WIP elevado na coluna",
        message: `Coluna “${label}” tem ${count} cards — ${ratio.toFixed(1)}× acima da média recente.`,
        diagnostics: {
          ratio,
          columnKey: key,
          columnLabel: label,
          current: count,
          baselineMean: m,
          zScore: zs?.z ?? null,
        },
        boardId: board.id,
        boardName: board.name,
      };
    }
  }
  return null;
}

export function detectStagnation(board: BoardData, nowMs: number): AnomalyAlertPayload | null {
  const n = countStagnantCards(board, 10, nowMs);
  if (n < 5) return null;
  return {
    kind: "stagnation_cluster",
    severity: n >= 8 ? "warning" : "info",
    title: "Possível bloqueio (cards parados)",
    message: `${n} cards não mudam de coluna há 10+ dias — possível gargalo.`,
    diagnostics: { stagnantCount: n, thresholdDays: 10 },
    boardId: board.id,
    boardName: board.name,
  };
}

/** Baseline adaptativa (janela de snapshots diários) + fallback para o detector fixo legado. */
export function detectStagnationCluster(args: {
  board: BoardData;
  nowMs: number;
  historyStagnantCounts: number[];
}): AnomalyAlertPayload | null {
  const { board, nowMs, historyStagnantCounts } = args;
  const current = countStagnantCards(board, 10, nowMs);
  const hist = historyStagnantCounts.filter((n) => Number.isFinite(n) && n >= 0);
  if (hist.length >= 4) {
    const zs = zScore(current, hist);
    if (zs && zs.z > 2 && current >= 4) {
      return {
        kind: "stagnation_cluster",
        severity: current >= 8 || zs.z > 2.5 ? "warning" : "warning",
        title: "Possível bloqueio (cards parados)",
        message: `${current} cards parados há 10+ dias — acima do padrão recente (z ≈ ${zs.z.toFixed(2)}; média ${zs.mean.toFixed(1)}).`,
        diagnostics: {
          stagnantCount: current,
          thresholdDays: 10,
          zScore: zs.z,
          baselineMean: zs.mean,
          baselineStd: zs.std,
          adaptive: true,
        },
        boardId: board.id,
        boardName: board.name,
      };
    }
  }
  return detectStagnation(board, nowMs);
}

export function detectOkrDrift(projections: OkrKrProjection[]): AnomalyAlertPayload[] {
  const out: AnomalyAlertPayload[] = [];
  for (const p of projections) {
    if (!p.riskBelowThreshold) continue;
    if (p.metricType === "Manual" || p.linkBroken) continue;
    const weeksLeft = p.weeksUntilQuarterEnd;
    const pct = Math.round(p.pct);
    out.push({
      kind: "okr_drift",
      severity: p.projectedPctAtQuarterEnd < 50 ? "critical" : "warning",
      title: "KR com risco de não bater a meta",
      message: `KR “${p.krTitle}” está em ~${pct}% com ~${weeksLeft.toFixed(1)} sem. úteis no quarter — projeção ~${p.projectedPctAtQuarterEnd}% ao fim do período.`,
      diagnostics: {
        keyResultId: p.keyResultId,
        objectiveTitle: p.objectiveTitle,
        current: p.current,
        target: p.target,
        projectedPctAtQuarterEnd: p.projectedPctAtQuarterEnd,
        weeksUntilQuarterEnd: weeksLeft,
        avgWeeklyThroughput: p.avgWeeklyThroughput,
      },
    });
  }
  return out;
}

export function detectOverdueCascade(args: {
  boards: BoardData[];
  todayMs: number;
  historyDueSoonCounts: number[];
}): AnomalyAlertPayload | null {
  const { boards, todayMs, historyDueSoonCounts } = args;
  const current = countDueWithinDays(boards, 3, todayMs);
  if (current < 5) return null;
  const usable = [...historyDueSoonCounts].filter((x) => x >= 0);
  if (usable.length < 3) {
    return {
      kind: "overdue_cascade",
      severity: "warning",
      title: "Muitos prazos nos próximos 3 dias",
      message: `${current} cards vencem em até 3 dias — concentração elevada.`,
      diagnostics: { dueSoonCount: current, windowDays: 3, baselineMax: null },
    };
  }
  const maxHist = Math.max(...usable);
  if (current >= Math.max(8, maxHist + 1)) {
    return {
      kind: "overdue_cascade",
      severity: current >= maxHist + 3 ? "critical" : "warning",
      title: "Pico de vencimentos próximos",
      message: `${current} cards expiram nos próximos 3 dias — maior acúmulo que nos últimos registros (máx. histórico: ${maxHist}).`,
      diagnostics: { dueSoonCount: current, windowDays: 3, baselineMax: maxHist },
    };
  }
  return null;
}

export function collectBucketLabelsForBoards(boards: BoardData[]): Map<string, string> {
  return collectBucketLabels(boards);
}
