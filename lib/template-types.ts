import type { AutomationRule } from "./automation-types";

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

/** Padrão: estrutura Kanban sem cards; `priority_matrix` inclui cópias de cards nos quadrantes. */
export type TemplateKind = "kanban" | "priority_matrix";

export const PRIORITY_MATRIX_QUADRANT_KEYS = ["do_first", "schedule", "delegate", "eliminate"] as const;
export type PriorityMatrixQuadrantKey = (typeof PRIORITY_MATRIX_QUADRANT_KEYS)[number];

/** Eisenhower 4 quadrantes ou grade 4×4 (16 células). */
export type PriorityMatrixModel = "eisenhower" | "grid4";

export type BoardTemplateSnapshot = {
  config: { bucketOrder: unknown[]; collapsedColumns?: string[]; labels?: string[] };
  mapaProducao: unknown[];
  /** Tags/labels observadas no board na exportação (sem conteúdo de cards). */
  labelPalette: string[];
  automations: AutomationRule[];
  /** Opcional: metodologia do quadro exportado. */
  boardMethodology?: "scrum" | "kanban";
  /** Ausente ou `kanban`: snapshot clássico; `priority_matrix`: quatro colunas + `templateCards`. */
  templateKind?: TemplateKind;
  /** Com `priority_matrix`: quadrantes Eisenhower ou grade 4×4 (16 colunas). */
  priorityMatrixModel?: PriorityMatrixModel;
  /** Cópias serializáveis para import (novos ids na criação do board). */
  templateCards?: unknown[];
};

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
  createdAt: string;
  updatedAt: string;
};
