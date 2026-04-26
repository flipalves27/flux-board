import { getFreeMaxBoards, getFreeMaxUsers, getPaidMaxBoards, getProMaxUsers, getBusinessMaxUsers, TRIAL_DAYS, DOWNGRADE_GRACE_DAYS } from "@/lib/billing-limits";
import { PLAN_FEATURE_MATRIX, type FeatureKey, type EffectiveGateTier } from "@/lib/plan-gates";
import { PRO_FEATURE_LABELS_PT } from "@/lib/plan-gates";
import type { ManualLocale } from "@/lib/manual-types";

const PT_LABEL = new Map<FeatureKey, string>(PRO_FEATURE_LABELS_PT.map((x) => [x.key, x.label] as const));

function humanizeFeatureKeyEn(key: FeatureKey): string {
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function labelForKey(key: FeatureKey, locale: ManualLocale): string {
  if (locale === "pt-BR") {
    return PT_LABEL.get(key) ?? humanizeFeatureKeyEn(key);
  }
  return humanizeFeatureKeyEn(key);
}

function labelTier(t: EffectiveGateTier, locale: ManualLocale): string {
  const m =
    t === "free" ? (locale === "en" ? "Free" : "Grátis") : t === "pro" ? (locale === "en" ? "Pro" : "Pro") : "Business";
  return m;
}

function tiersString(tiers: readonly EffectiveGateTier[], locale: ManualLocale): string {
  if (tiers.length === 0) return "—";
  return [...new Set(tiers.map((t) => labelTier(t, locale)))].join(" · ");
}

export type ManualPlansSnapshot = {
  freeMaxBoards: number;
  freeMaxUsers: number;
  proMaxUsers: number;
  businessMaxUsers: number;
  paidMaxBoards: number;
  trialDays: number;
  downgradeGraceDays: number;
  featureRows: { key: FeatureKey; label: string; allowedTiers: string }[];
};

/**
 * Dados de referência (planos/limites/matriz) derivados do código — não edite a tabela manualmente no MD.
 */
export function getDerivedPlansSnapshot(locale: ManualLocale): ManualPlansSnapshot {
  const keys = Object.keys(PLAN_FEATURE_MATRIX) as FeatureKey[];
  const rows = keys
    .sort()
    .map((key) => ({
      key,
      label: labelForKey(key, locale),
      allowedTiers: tiersString(PLAN_FEATURE_MATRIX[key]!, locale),
    }));

  return {
    freeMaxBoards: getFreeMaxBoards(),
    freeMaxUsers: getFreeMaxUsers(),
    proMaxUsers: getProMaxUsers(),
    businessMaxUsers: getBusinessMaxUsers(),
    paidMaxBoards: getPaidMaxBoards(),
    trialDays: TRIAL_DAYS,
    downgradeGraceDays: DOWNGRADE_GRACE_DAYS,
    featureRows: rows,
  };
}
