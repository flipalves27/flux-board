import type { AutomationRule } from "./automation-types";
import type { BpmnTemplateModel } from "./bpmn-types";

export const TEMPLATE_CATEGORIES = [
  "sales",
  "operations",
  "projects",
  "hr",
  "marketing",
  "customer_success",
  "support",
  "insurance_warranty",
] as const;

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export type TemplatePricingTier = "free" | "premium";

/** Padrão: estrutura Kanban sem cards; templates estratégicos incluem cópias de cards. */
export type TemplateKind = "kanban" | "priority_matrix" | "bpmn" | "swot" | "strategic_portfolio";

export const PRIORITY_MATRIX_QUADRANT_KEYS = ["do_first", "schedule", "delegate", "eliminate"] as const;
export type PriorityMatrixQuadrantKey = (typeof PRIORITY_MATRIX_QUADRANT_KEYS)[number];

/** Eisenhower 4 quadrantes ou grade 4×4 (16 células). */
export type PriorityMatrixModel = "eisenhower" | "grid4";

export type MatrixAxesMeta = {
  horizontalLabel: string;
  verticalLabel: string;
};

export type MatrixClassificationRules = {
  urgentHint?: string;
  importantHint?: string;
};

export type PriorityMatrixMeta = {
  axes?: MatrixAxesMeta;
  quadrantLabels?: Partial<Record<PriorityMatrixQuadrantKey, string>>;
  defaultView?: "kanban" | "eisenhower";
  classificationRules?: MatrixClassificationRules;
};

export const SWOT_QUADRANT_KEYS = ["strengths", "weaknesses", "opportunities", "threats"] as const;
export type SwotQuadrantKey = (typeof SWOT_QUADRANT_KEYS)[number];
export type SwotBucketKey = SwotQuadrantKey | "tows_strategies" | "action_plan";
export type SwotTowsStrategyKind = "SO" | "WO" | "ST" | "WT";

export type SwotCardMeta = {
  quadrant: SwotQuadrantKey;
  evidence?: string;
  impact?: number;
  confidence?: number;
  effort?: number;
  urgency?: number;
  risk?: number;
  horizon?: "now" | "quarter" | "semester";
  status?: "hypothesis" | "validated" | "converted" | "discarded";
  relatedCardIds?: string[];
};

export type SwotTowsStrategy = {
  id: string;
  kind: SwotTowsStrategyKind;
  title: string;
  description: string;
  sourceCardIds: string[];
  impact?: number;
  confidence?: number;
  effort?: number;
  risk?: number;
  convertedCardId?: string;
};

export type SwotMeta = {
  version: "swot-tows-v1";
  quadrantLabels?: Partial<Record<SwotQuadrantKey, string>>;
  defaultView?: "swot" | "kanban";
  towsStrategies?: SwotTowsStrategy[];
  qualityChecklist?: string[];
};

export type StrategicPortfolioHealth = "green" | "yellow" | "red" | "blocked";

export type StrategicPortfolioCardMeta = {
  businessOutcome?: string;
  health?: StrategicPortfolioHealth;
  milestoneLabel?: string;
  ownerName?: string;
  phase?: "Discovery" | "Build" | "Rollout" | "Scale" | "Done" | string;
};

export type StrategicPortfolioMeta = {
  version: "strategic-portfolio-v1";
  defaultView?: "strategic_portfolio" | "kanban";
  objectiveLabels?: Record<string, string>;
  healthLabels?: Partial<Record<StrategicPortfolioHealth, string>>;
  kpiLabels?: string[];
};

export type BoardTemplateSnapshot = {
  config: {
    bucketOrder: unknown[];
    collapsedColumns?: string[];
    labels?: string[];
    strategyTemplateKind?: "swot" | "strategic_portfolio";
  };
  mapaProducao: unknown[];
  /** Tags/labels observadas no board na exportação (sem conteúdo de cards). */
  labelPalette: string[];
  automations: AutomationRule[];
  /**
   * Opcional: metodologia do quadro exportado. Os mesmos valores existem em `BoardData.boardMethodology`.
   * `templateKind` (ex.: bpmn, priority_matrix) continua a sobrepor a forma de instanciar o board; em dúvida
   * o import usa kanban para BPMN/matriz e aplica o snapshot de colunas fornecido.
   */
  boardMethodology?: "scrum" | "kanban" | "lean_six_sigma" | "discovery" | "safe";
  /** Ausente ou `kanban`: snapshot clássico; templates estratégicos: colunas próprias + `templateCards`. */
  templateKind?: TemplateKind;
  /** Com `priority_matrix`: quadrantes Eisenhower ou grade 4×4 (16 colunas). */
  priorityMatrixModel?: PriorityMatrixModel;
  /** Cópias serializáveis para import (novos ids na criação do board). */
  templateCards?: unknown[];
  /** Metadados visuais/semânticos para renderização da matriz. */
  priorityMatrixMeta?: PriorityMatrixMeta;
  /** Modelo BPMN canônico simplificado. */
  bpmnModel?: BpmnTemplateModel;
  /** Metadados visuais/estratégicos para templates SWOT/TOWS. */
  swotMeta?: SwotMeta;
  /** Metadados executivos para Strategic Portfolio View. */
  strategicPortfolioMeta?: StrategicPortfolioMeta;
};

export type TemplateLifecycleStatus = "draft" | "published" | "archived";

export type PublishedTemplate = {
  _id: string;
  slug: string;
  title: string;
  description: string;
  category: TemplateCategory;
  pricingTier: TemplatePricingTier;
  /** Repasse ao criador em templates premium (ex.: 70%). */
  creatorRevenueSharePercent: number;
  creatorOrgId: string;
  creatorOrgName?: string;
  snapshot: BoardTemplateSnapshot;
  sourceBoardId?: string;
  status?: TemplateLifecycleStatus;
  version?: number;
  publishedAt?: string;
  archivedAt?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
};
