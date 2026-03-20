export type OkrsMetricType = "card_count" | "card_in_column" | "Manual";

export type OkrsStatus = "Não iniciado" | "Em andamento" | "Concluída";

export type OkrsKeyResultDefinition = {
  id: string;
  objectiveId: string;
  title: string;
  metric_type: OkrsMetricType;
  target: number;
  linkedBoardId: string;
  linkedColumnKey?: string | null;
  manualCurrent?: number | null;
};

export type OkrsObjectiveDefinition = {
  id: string;
  title: string;
  owner?: string | null;
  quarter: string;
  keyResults: OkrsKeyResultDefinition[];
};

export type OkrsKeyResultComputed = {
  definition: OkrsKeyResultDefinition;
  current: number;
  pct: number; // 0-100
  status: OkrsStatus;
  linkBroken?: boolean; // usado apenas quando metric_type exige coluna
};

export type OkrsObjectiveComputed = {
  objective: OkrsObjectiveDefinition;
  keyResults: OkrsKeyResultComputed[];
  objectiveCurrentPct: number; // 0-100 (derivado do min)
  status: OkrsStatus;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function progressPct(current: number, target: number): number {
  if (!Number.isFinite(target) || target <= 0) return 0;
  return clamp(Math.round((current / target) * 100), 0, 100);
}

function statusFromPct(pct: number): OkrsStatus {
  if (pct <= 0) return "Não iniciado";
  if (pct >= 100) return "Concluída";
  return "Em andamento";
}

export function computeKeyResultProgress(args: {
  cards: Array<{ bucket?: string | null }>;
  keyResult: OkrsKeyResultDefinition;
  bucketKeys?: Set<string>; // para detectar link quebrado (opcional)
}): OkrsKeyResultComputed {
  const { cards, keyResult, bucketKeys } = args;

  const current =
    keyResult.metric_type === "card_count"
      ? cards.length
      : keyResult.metric_type === "card_in_column"
        ? (cards.filter((c) => String(c.bucket || "") === String(keyResult.linkedColumnKey || "")).length as number)
        : // Manual
          (typeof keyResult.manualCurrent === "number" && Number.isFinite(keyResult.manualCurrent) ? keyResult.manualCurrent : 0);

  // Link quebrado: coluna vinculada não existe no board.
  let linkBroken = false;
  if (keyResult.metric_type === "card_in_column") {
    const linked = String(keyResult.linkedColumnKey || "");
    if (linked && bucketKeys && !bucketKeys.has(linked)) linkBroken = true;
    if (!linked) linkBroken = true;
  }

  // Quando link está quebrado, tratamos progresso efetivo como 0
  // para não permitir que o objetivo avance com uma métrica "sem fonte".
  const effectiveCurrent = linkBroken ? 0 : current;
  const pct = progressPct(effectiveCurrent, keyResult.target);

  return {
    definition: keyResult,
    current: effectiveCurrent,
    pct,
    status: statusFromPct(pct),
    linkBroken: keyResult.metric_type === "card_in_column" ? linkBroken : undefined,
  };
}

export function computeObjectiveProgress(args: {
  cards: Array<{ bucket?: string | null }>;
  objective: OkrsObjectiveDefinition;
  bucketKeys?: Set<string>;
}): OkrsObjectiveComputed {
  const { cards, objective, bucketKeys } = args;
  const computedKrs = objective.keyResults.map((kr) =>
    computeKeyResultProgress({ cards, keyResult: kr, bucketKeys })
  );

  const objectiveCurrentPct =
    computedKrs.length === 0 ? 0 : Math.min(...computedKrs.map((kr) => kr.pct));

  return {
    objective,
    keyResults: computedKrs,
    objectiveCurrentPct,
    status: statusFromPct(objectiveCurrentPct),
  };
}

export function computeOkrsProgress(args: {
  cards: Array<{ bucket?: string | null }>;
  objectives: OkrsObjectiveDefinition[];
  bucketKeys?: Set<string>;
}): OkrsObjectiveComputed[] {
  const { cards, objectives, bucketKeys } = args;
  return objectives.map((o) => computeObjectiveProgress({ cards, objective: o, bucketKeys }));
}

