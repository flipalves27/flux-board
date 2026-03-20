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

/** Snapshot sem cards — apenas estrutura, automações e rótulos derivados. */
export type BoardTemplateSnapshot = {
  config: { bucketOrder: unknown[]; collapsedColumns?: string[]; labels?: string[] };
  mapaProducao: unknown[];
  /** Tags/labels observadas no board na exportação (sem conteúdo de cards). */
  labelPalette: string[];
  automations: AutomationRule[];
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
