import type { BoardData } from "./kv-boards";
import type { AutomationRule } from "./automation-types";
import type {
  BoardTemplateSnapshot,
  PriorityMatrixQuadrantKey,
  StrategicPortfolioCardMeta,
  StrategicPortfolioMeta,
  SwotQuadrantKey,
  SwotMeta,
} from "./template-types";
import { matrixCellKey, priorityMatrixGrid4BucketOrder } from "./matrix-grid4";
import type { BpmnTemplateModel } from "./bpmn-types";
import { validateBpmnModel } from "./bpmn-types";

function parseCards(raw: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(raw)) return [];
  return raw.filter((c) => c && typeof c === "object") as Array<Record<string, unknown>>;
}

/** Coleta tags únicas dos cards (rótulos), sem persistir o conteúdo dos cards. */
export function collectLabelPaletteFromCards(cards: unknown): string[] {
  const set = new Set<string>();
  for (const c of parseCards(cards)) {
    const tags = c.tags;
    if (Array.isArray(tags)) {
      for (const t of tags) {
        if (typeof t === "string" && t.trim()) set.add(t.trim().slice(0, 60));
      }
    }
  }
  return [...set].slice(0, 80);
}

/** Colunas fixas da matriz Eisenhower (rótulos em PT; chaves estáveis para import). */
export function priorityMatrixBucketOrder(): Array<{ key: string; label: string; color: string }> {
  return [
    { key: "do_first", label: "Urgente e importante", color: "var(--flux-danger)" },
    { key: "schedule", label: "Importante, não urgente", color: "var(--flux-secondary)" },
    { key: "delegate", label: "Urgente, não importante", color: "var(--flux-warning)" },
    { key: "eliminate", label: "Nem urgente nem importante", color: "var(--flux-text-muted)" },
  ];
}

function cardToTemplateSeed(
  card: Record<string, unknown>,
  bucketKey: string,
  order: number,
  extra?: {
    matrixWeight?: number;
    matrixWeightBand?: "low" | "medium" | "high" | "critical";
    swotMeta?: unknown;
    portfolioMeta?: StrategicPortfolioCardMeta;
  }
): Record<string, unknown> {
  const titleRaw = typeof card.title === "string" ? card.title.trim().slice(0, 300) : "";
  const desc = typeof card.desc === "string" ? card.desc.slice(0, 6000) : "";
  const priority = typeof card.priority === "string" && card.priority.trim() ? card.priority.trim().slice(0, 100) : "Média";
  const progress =
    typeof card.progress === "string" && card.progress.trim() ? card.progress.trim().slice(0, 100) : "Não iniciado";
  const tags = Array.isArray(card.tags)
    ? card.tags
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim().slice(0, 60))
        .filter(Boolean)
        .slice(0, 30)
    : [];
  const base: Record<string, unknown> = {
    bucket: bucketKey,
    priority,
    progress,
    title: titleRaw || "Card",
    desc,
    tags,
    direction: typeof card.direction === "string" && card.direction ? card.direction : null,
    dueDate: card.dueDate === null || typeof card.dueDate === "string" ? card.dueDate : null,
    order,
    blockedBy: [],
  };
  if (Array.isArray(card.links)) base.links = card.links;
  if (Array.isArray(card.docRefs)) base.docRefs = card.docRefs;
  if (typeof card.storyPoints === "number" || card.storyPoints === null) base.storyPoints = card.storyPoints;
  if (card.serviceClass !== undefined) base.serviceClass = card.serviceClass;
  if (typeof extra?.matrixWeight === "number") base.matrixWeight = extra.matrixWeight;
  if (extra?.matrixWeightBand) base.matrixWeightBand = extra.matrixWeightBand;
  if (extra?.swotMeta) base.swotMeta = extra.swotMeta;
  if (extra?.portfolioMeta) base.portfolioMeta = extra.portfolioMeta;
  return base;
}

export function strategicPortfolioBucketOrder(): Array<{ key: string; label: string; color: string; policy?: string }> {
  return [
    {
      key: "grow_revenue",
      label: "Grow Revenue",
      color: "var(--flux-success)",
      policy: "Iniciativas com impacto claro em receita, expansão ou monetização.",
    },
    {
      key: "improve_retention",
      label: "Improve Retention",
      color: "var(--flux-secondary)",
      policy: "Trabalho que aumenta retenção, adoção e valor percebido por clientes.",
    },
    {
      key: "operational_excellence",
      label: "Operational Excellence",
      color: "var(--flux-warning)",
      policy: "Eficiência, qualidade operacional, risco e redução de custo.",
    },
    {
      key: "platform_scale",
      label: "Platform Scale",
      color: "var(--flux-primary)",
      policy: "Capacidades estruturais para escala, segurança e crescimento sustentável.",
    },
  ];
}

export function swotBucketOrder(): Array<{ key: string; label: string; color: string; policy?: string }> {
  return [
    { key: "strengths", label: "Strengths", color: "var(--flux-success)", policy: "Capacidades internas comprovadas por evidência." },
    { key: "weaknesses", label: "Weaknesses", color: "var(--flux-warning)", policy: "Limitações internas que reduzem execução ou vantagem." },
    { key: "opportunities", label: "Opportunities", color: "var(--flux-secondary)", policy: "Mudanças externas que podem criar ganho estratégico." },
    { key: "threats", label: "Threats", color: "var(--flux-danger)", policy: "Riscos externos com impacto relevante." },
    { key: "tows_strategies", label: "TOWS strategies", color: "var(--flux-primary)", policy: "Estratégias revisáveis geradas a partir de cruzamentos SWOT." },
    { key: "action_plan", label: "Action plan", color: "var(--flux-accent)", policy: "Iniciativas derivadas, com dono, prazo e Definition of Done." },
  ];
}

export type SwotSelection = {
  cardId: string;
  quadrantKey: SwotQuadrantKey;
  evidence?: string;
  impact?: number;
  confidence?: number;
  effort?: number;
  urgency?: number;
  risk?: number;
  horizon?: "now" | "quarter" | "semester";
};

function clampScore(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(5, Math.round(value)));
}

function defaultSwotMeta(): SwotMeta {
  return {
    version: "swot-tows-v1",
    defaultView: "swot",
    quadrantLabels: {
      strengths: "Strengths",
      weaknesses: "Weaknesses",
      opportunities: "Opportunities",
      threats: "Threats",
    },
    qualityChecklist: [
      "Cada item SWOT deve ter evidência explícita.",
      "Itens críticos devem ter impacto e confiança preenchidos.",
      "Oportunidades e ameaças relevantes devem gerar ao menos uma estratégia TOWS.",
      "Estratégias aprovadas devem virar iniciativas no plano de ação.",
    ],
    towsStrategies: [],
  };
}

function defaultStrategicPortfolioMeta(): StrategicPortfolioMeta {
  return {
    version: "strategic-portfolio-v1",
    defaultView: "strategic_portfolio",
    objectiveLabels: Object.fromEntries(strategicPortfolioBucketOrder().map((bucket) => [bucket.key, bucket.label])),
    healthLabels: {
      green: "On track",
      yellow: "Watch",
      red: "At risk",
      blocked: "Blocked",
    },
    kpiLabels: ["Total initiatives", "On track", "Needs attention", "Next milestones"],
  };
}

export function buildStrategicPortfolioTemplateSnapshot(
  meta?: Partial<StrategicPortfolioMeta>
): BoardTemplateSnapshot {
  const objectiveBuckets = strategicPortfolioBucketOrder();
  const sampleCards: Array<{
    bucket: string;
    title: string;
    desc: string;
    priority: string;
    progress: string;
    dueDate: string;
    order: number;
    tags: string[];
    portfolioMeta: StrategicPortfolioCardMeta;
  }> = [
    {
      bucket: "grow_revenue",
      title: "Enterprise expansion playbook",
      desc: "Business outcome: lift enterprise ARR by focusing sales enablement, packaging and renewal expansion signals.",
      priority: "Alta",
      progress: "Build",
      dueDate: "2026-05-15",
      order: 0,
      tags: ["Strategic Portfolio", "Revenue", "Executive"],
      portfolioMeta: {
        businessOutcome: "Increase enterprise ARR through repeatable expansion motions.",
        health: "green",
        milestoneLabel: "Pilot readout",
        ownerName: "Revenue Lead",
        phase: "Build",
      },
    },
    {
      bucket: "improve_retention",
      title: "Customer health early-warning system",
      desc: "Business outcome: reduce avoidable churn by surfacing risk before executive business reviews.",
      priority: "Alta",
      progress: "Discovery",
      dueDate: "2026-05-30",
      order: 0,
      tags: ["Strategic Portfolio", "Retention", "Risk"],
      portfolioMeta: {
        businessOutcome: "Reduce preventable churn with earlier intervention signals.",
        health: "yellow",
        milestoneLabel: "Risk model v1",
        ownerName: "CS Ops",
        phase: "Discovery",
      },
    },
    {
      bucket: "operational_excellence",
      title: "Quote-to-cash cycle compression",
      desc: "Business outcome: lower revenue leakage and shorten approval cycle time for strategic deals.",
      priority: "Média",
      progress: "Rollout",
      dueDate: "2026-06-07",
      order: 0,
      tags: ["Strategic Portfolio", "Operations", "Efficiency"],
      portfolioMeta: {
        businessOutcome: "Shorten quote approvals and reduce manual rework.",
        health: "red",
        milestoneLabel: "Approval SLA reset",
        ownerName: "BizOps",
        phase: "Rollout",
      },
    },
    {
      bucket: "platform_scale",
      title: "Regional reliability foundation",
      desc: "Business outcome: support larger customers with measurable uptime and compliance confidence.",
      priority: "Alta",
      progress: "Build",
      dueDate: "2026-06-21",
      order: 0,
      tags: ["Strategic Portfolio", "Platform", "Reliability"],
      portfolioMeta: {
        businessOutcome: "Improve enterprise confidence with regional resilience.",
        health: "blocked",
        milestoneLabel: "Dependency unblock",
        ownerName: "Platform",
        phase: "Build",
      },
    },
  ];

  const templateCards = sampleCards.map((card) =>
    cardToTemplateSeed(card, card.bucket, card.order, { portfolioMeta: card.portfolioMeta })
  );
  const labels = ["Strategic Portfolio", "Executive", "Revenue", "Retention", "Risk", "Milestone"];
  const mergedMeta: StrategicPortfolioMeta = {
    ...defaultStrategicPortfolioMeta(),
    ...(meta ?? {}),
    version: "strategic-portfolio-v1",
  };

  return {
    templateKind: "strategic_portfolio",
    strategicPortfolioMeta: mergedMeta,
    config: {
      bucketOrder: objectiveBuckets,
      collapsedColumns: [],
      labels,
      strategyTemplateKind: "strategic_portfolio",
    },
    mapaProducao: [],
    labelPalette: [...new Set([...labels, ...collectLabelPaletteFromCards(templateCards)])].slice(0, 100),
    automations: [],
    boardMethodology: "kanban",
    templateCards,
  };
}

export function buildSwotSnapshotFromBoard(
  board: BoardData,
  selections: SwotSelection[],
  meta?: Partial<SwotMeta>
): BoardTemplateSnapshot {
  const byId = new Map<string, Record<string, unknown>>();
  for (const c of parseCards(board.cards)) {
    const id = typeof c.id === "string" ? c.id : "";
    if (id) byId.set(id, c);
  }

  const orderByQuadrant: Record<SwotQuadrantKey, number> = {
    strengths: 0,
    weaknesses: 0,
    opportunities: 0,
    threats: 0,
  };
  const templateCards: unknown[] = [];
  for (const sel of selections) {
    const card = byId.get(sel.cardId);
    if (!card) {
      throw new Error(`Card não encontrado no board: ${sel.cardId}`);
    }
    const ord = orderByQuadrant[sel.quadrantKey]++;
    const tags = Array.isArray(card.tags) ? card.tags.filter((t): t is string => typeof t === "string") : [];
    const swotTags = [...new Set([...tags, "SWOT", sel.quadrantKey])].slice(0, 30);
    templateCards.push(
      cardToTemplateSeed({ ...card, tags: swotTags }, sel.quadrantKey, ord, {
        swotMeta: {
          quadrant: sel.quadrantKey,
          evidence: sel.evidence?.trim() || undefined,
          impact: clampScore(sel.impact),
          confidence: clampScore(sel.confidence),
          effort: clampScore(sel.effort),
          urgency: clampScore(sel.urgency),
          risk: clampScore(sel.risk),
          horizon: sel.horizon,
          status: "hypothesis",
          relatedCardIds: [],
        },
      })
    );
  }

  const labels = ["SWOT", "TOWS", "Evidence", "Action", "Risk", "Quick win"];
  const labelPalette = [...new Set([...labels, ...collectLabelPaletteFromCards(templateCards)])].slice(0, 100);
  const mergedMeta: SwotMeta = { ...defaultSwotMeta(), ...(meta ?? {}), version: "swot-tows-v1" };

  return {
    templateKind: "swot",
    swotMeta: mergedMeta,
    config: {
      bucketOrder: swotBucketOrder(),
      collapsedColumns: [],
      labels,
      strategyTemplateKind: "swot",
    },
    mapaProducao: [],
    labelPalette,
    automations: [],
    boardMethodology: "kanban",
    templateCards,
  };
}

export type PriorityMatrixSelection = { cardId: string; quadrantKey: PriorityMatrixQuadrantKey };

/**
 * Snapshot de matriz de priorização: quatro colunas + cópias de cards por quadrante.
 * Não inclui automações (colunas diferentes do board de origem).
 */
export function buildPriorityMatrixSnapshotFromBoard(
  board: BoardData,
  selections: PriorityMatrixSelection[]
): BoardTemplateSnapshot {
  const byId = new Map<string, Record<string, unknown>>();
  for (const c of parseCards(board.cards)) {
    const id = typeof c.id === "string" ? c.id : "";
    if (id) byId.set(id, c);
  }

  const orderByQuadrant: Record<PriorityMatrixQuadrantKey, number> = {
    do_first: 0,
    schedule: 0,
    delegate: 0,
    eliminate: 0,
  };

  const templateCards: unknown[] = [];
  for (const sel of selections) {
    const card = byId.get(sel.cardId);
    if (!card) {
      throw new Error(`Card não encontrado no board: ${sel.cardId}`);
    }
    const q = sel.quadrantKey;
    const ord = orderByQuadrant[q]++;
    templateCards.push(cardToTemplateSeed(card, q, ord));
  }

  const labelPalette = [...new Set([...collectLabelPaletteFromCards(templateCards)])].slice(0, 100);

  return {
    templateKind: "priority_matrix",
    priorityMatrixModel: "eisenhower",
    priorityMatrixMeta: {
      axes: {
        horizontalLabel: "Urgência",
        verticalLabel: "Importância",
      },
      quadrantLabels: {
        do_first: "Urgente e importante",
        schedule: "Importante, não urgente",
        delegate: "Urgente, não importante",
        eliminate: "Nem urgente nem importante",
      },
      defaultView: "eisenhower",
      classificationRules: {
        urgentHint: "Prazo, SLA ou custo de atraso elevado.",
        importantHint: "Impacto direto em objetivo de negócio/usuário.",
      },
    },
    config: {
      bucketOrder: priorityMatrixBucketOrder(),
      collapsedColumns: [],
    },
    mapaProducao: [],
    labelPalette,
    automations: [],
    boardMethodology: "kanban",
    templateCards,
  };
}

export type PriorityMatrixGridSelection = { cardId: string; row: number; col: number };

function matrixBandFromWeight(weight: number): "low" | "medium" | "high" | "critical" {
  if (weight >= 76) return "critical";
  if (weight >= 56) return "high";
  if (weight >= 36) return "medium";
  return "low";
}

function matrixWeightFromRowCol(row: number, col: number): number {
  const normalized = Math.max(0, Math.min(1, ((3 - row) + col) / 6));
  return Math.round(normalized * 100);
}

/**
 * Matriz 4×4: 16 colunas (uma por célula) + cópias de cards por posição (row/col).
 */
export function buildPriorityMatrixGrid4SnapshotFromBoard(
  board: BoardData,
  selections: PriorityMatrixGridSelection[]
): BoardTemplateSnapshot {
  const byId = new Map<string, Record<string, unknown>>();
  for (const c of parseCards(board.cards)) {
    const id = typeof c.id === "string" ? c.id : "";
    if (id) byId.set(id, c);
  }

  const orderByCell = new Map<string, number>();

  const templateCards: unknown[] = [];
  for (const sel of selections) {
    const row = sel.row;
    const col = sel.col;
    if (row < 0 || row > 3 || col < 0 || col > 3) continue;
    const card = byId.get(sel.cardId);
    if (!card) {
      throw new Error(`Card não encontrado no board: ${sel.cardId}`);
    }
    const bucketKey = matrixCellKey(row, col);
    const ord = orderByCell.get(bucketKey) ?? 0;
    orderByCell.set(bucketKey, ord + 1);
    const weight = matrixWeightFromRowCol(row, col);
    templateCards.push(
      cardToTemplateSeed(card, bucketKey, ord, {
        matrixWeight: weight,
        matrixWeightBand: matrixBandFromWeight(weight),
      })
    );
  }

  const labelPalette = [...new Set([...collectLabelPaletteFromCards(templateCards)])].slice(0, 100);

  return {
    templateKind: "priority_matrix",
    priorityMatrixModel: "grid4",
    priorityMatrixMeta: {
      axes: {
        horizontalLabel: "Urgência",
        verticalLabel: "Importância",
      },
      defaultView: "kanban",
      classificationRules: {
        urgentHint: "Da esquerda (menor) para direita (maior).",
        importantHint: "De baixo (menor) para cima (maior).",
      },
    },
    config: {
      bucketOrder: priorityMatrixGrid4BucketOrder(),
      collapsedColumns: [],
    },
    mapaProducao: [],
    labelPalette,
    automations: [],
    boardMethodology: "kanban",
    templateCards,
  };
}

export function buildTemplateSnapshotFromBoard(board: BoardData, rules: AutomationRule[]): BoardTemplateSnapshot {
  const cfg = board.config as Record<string, unknown> | undefined;
  const bucketOrder = Array.isArray(cfg?.bucketOrder) ? (cfg.bucketOrder as unknown[]) : [];
  const collapsed = Array.isArray(cfg?.collapsedColumns) ? (cfg.collapsedColumns as string[]) : [];
  const rawLabels = cfg?.labels;
  const labels = Array.isArray(rawLabels) ? (rawLabels as string[]) : [];
  const mapa = Array.isArray(board.mapaProducao) ? board.mapaProducao : [];
  const fromCards = collectLabelPaletteFromCards(board.cards);
  const labelPalette = [...new Set([...labels, ...fromCards])].slice(0, 100);

  return {
    config: {
      bucketOrder,
      ...(collapsed.length ? { collapsedColumns: collapsed } : {}),
      ...(labels.length ? { labels } : {}),
    },
    mapaProducao: mapa,
    labelPalette,
    automations: Array.isArray(rules) ? rules : [],
    ...(board.boardMethodology === "scrum" ||
    board.boardMethodology === "kanban" ||
    board.boardMethodology === "lean_six_sigma" ||
    board.boardMethodology === "discovery" ||
    board.boardMethodology === "safe"
      ? { boardMethodology: board.boardMethodology }
      : {}),
  };
}

export function buildBpmnSnapshotFromModel(model: BpmnTemplateModel): BoardTemplateSnapshot {
  const validation = validateBpmnModel(model);
  if (!validation.ok) {
    throw new Error(validation.issues.find((i) => i.severity === "error")?.message ?? "Modelo BPMN inválido.");
  }
  return {
    templateKind: "bpmn",
    bpmnModel: model,
    config: {
      bucketOrder: [{ key: "bpmn_canvas", label: "BPMN Canvas", color: "var(--flux-primary)" }],
      collapsedColumns: [],
      labels: ["BPMN"],
    },
    mapaProducao: [],
    labelPalette: ["BPMN"],
    automations: [],
    boardMethodology: "kanban",
  };
}
