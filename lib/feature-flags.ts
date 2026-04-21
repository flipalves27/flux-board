import type { Organization } from "@/lib/kv-organizations";
import { getEffectiveTier, type PlanGateContext } from "@/lib/plan-gates";

/** Tiers da especificação de inovação mapeados ao produto Flux Board. */
export type InnovationProductTier = "free" | "pro" | "enterprise";

export type InnovationFlagId =
  | "retro_assistant"
  | "backlog_prioritization"
  | "epic_decomposition"
  | "intelligence_dashboard"
  | "dependency_timeline"
  | "weekly_digest"
  | "decisions_log"
  | "card_onboarding"
  | "focus_mode"
  | "insights_api"
  | "template_gallery";

type FlagMeta = { defaultEnabled: boolean; minTier: InnovationProductTier };

/**
 * Defaults da spec §13.1 — podem ser sobrescritos por env `FLUX_FLAG_<ID>=0|1`.
 */
export const INNOVATION_FLAGS: Record<InnovationFlagId, FlagMeta> = {
  retro_assistant: { defaultEnabled: true, minTier: "pro" },
  backlog_prioritization: { defaultEnabled: true, minTier: "pro" },
  epic_decomposition: { defaultEnabled: true, minTier: "pro" },
  intelligence_dashboard: { defaultEnabled: true, minTier: "pro" },
  dependency_timeline: { defaultEnabled: true, minTier: "free" },
  weekly_digest: { defaultEnabled: true, minTier: "pro" },
  decisions_log: { defaultEnabled: true, minTier: "free" },
  card_onboarding: { defaultEnabled: true, minTier: "pro" },
  focus_mode: { defaultEnabled: true, minTier: "free" },
  insights_api: { defaultEnabled: true, minTier: "enterprise" },
  template_gallery: { defaultEnabled: true, minTier: "free" },
};

const TIER_RANK: Record<InnovationProductTier, number> = {
  free: 0,
  pro: 1,
  enterprise: 2,
};

function envFlagOverride(flag: InnovationFlagId): boolean | undefined {
  const key = `FLUX_FLAG_${flag.toUpperCase().replace(/-/g, "_")}`;
  const raw = process.env[key]?.trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "on") return true;
  if (raw === "0" || raw === "false" || raw === "off") return false;
  return undefined;
}

export function innovationProductTierFromOrg(
  org: Organization | null | undefined,
  ctx?: PlanGateContext
): InnovationProductTier {
  const t = getEffectiveTier(org, ctx);
  if (t === "business") return "enterprise";
  if (t === "pro") return "pro";
  return "free";
}

export function isInnovationFlagEnabled(
  flag: InnovationFlagId,
  org: Organization | null | undefined,
  ctx?: PlanGateContext
): boolean {
  const override = envFlagOverride(flag);
  if (override !== undefined) return override;
  const meta = INNOVATION_FLAGS[flag];
  const tier = innovationProductTierFromOrg(org, ctx);
  return meta.defaultEnabled && TIER_RANK[tier] >= TIER_RANK[meta.minTier];
}
