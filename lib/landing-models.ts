export type LandingLocale = "en" | "pt-BR";

export type RoadmapTier = "free" | "pro" | "business";

export type RoadmapItemModel = {
  id: string;
  tier: Exclude<RoadmapTier, "free">;
};

export const ROADMAP_ITEMS: readonly RoadmapItemModel[] = [
  { id: "sprint_engine", tier: "pro" },
  { id: "ceremonies", tier: "business" },
  { id: "dependency_graph_visual", tier: "business" },
  { id: "flux_docs_rag", tier: "pro" },
  { id: "anomaly_email", tier: "business" },
] as const;

export type PricingPlanId = "free" | "pro" | "business";

export type PricingFeatureRow = { label: string; included: boolean; dim?: boolean };

export type PricingPlanViewModel = {
  id: PricingPlanId;
  name: string;
  price: string;
  priceSub: string;
  desc: string;
  limits: string | null;
  cta: string;
  ctaHref: string;
  highlighted: boolean;
  badge: string | null;
  features: PricingFeatureRow[];
  inherit: string | null;
};
