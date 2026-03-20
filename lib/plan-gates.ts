import type { Organization } from "./kv-organizations";
import { isProTenant } from "./commercial-plan";

export type Tier = Organization["plan"]; // "free" | "pro" | "business"

export type FeatureKey =
  | "executive_brief"
  | "card_context"
  | "daily_insights"
  | "portfolio_export"
  | "board_copilot"
  | "okr_engine"
  | "flux_docs"
  | "flux_docs_rag";

const FEATURE_ALLOWED_TIERS: Record<FeatureKey, Tier[]> = {
  executive_brief: ["pro", "business"],
  card_context: ["pro", "business"],
  daily_insights: ["pro", "business"],
  portfolio_export: ["pro", "business"],
  board_copilot: ["pro", "business"],
  okr_engine: ["pro", "business"],
  flux_docs: ["pro", "business"],
  flux_docs_rag: ["pro", "business"],
};

const DAY_MS = 24 * 60 * 60 * 1000;

export class PlanGateError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.status = status;
  }
}

export function getEffectiveTier(org: Organization | null | undefined): Tier {
  // Override de ambiente (dev/test): mantém comportamento legado.
  if (isProTenant()) return "pro";
  return (org?.plan ?? "free") as Tier;
}

export function getBoardCap(org: Organization | null | undefined): number | null {
  const tier = getEffectiveTier(org);
  if (tier === "free") return org?.maxBoards ?? 3;
  return null; // Pro/Business: ilimitado
}

export function getUserCap(org: Organization | null | undefined): number | null {
  const tier = getEffectiveTier(org);
  if (tier === "free") return org?.maxUsers ?? 1;
  return null; // Pro/Business: sem teto via `maxUsers` (gates bypass).
}

export function canUseFeature(org: Organization | null | undefined, feature: FeatureKey): boolean {
  if (feature === "flux_docs") {
    const raw = (process.env.FLUX_DOCS_ENABLED || process.env.NEXT_PUBLIC_FLUX_DOCS_ENABLED || "true").toLowerCase();
    if (raw === "false" || raw === "0" || raw === "off") return false;
  }
  if (feature === "flux_docs_rag") {
    const raw = (process.env.FLUX_DOCS_RAG_ENABLED || process.env.NEXT_PUBLIC_FLUX_DOCS_RAG_ENABLED || "true").toLowerCase();
    if (raw === "false" || raw === "0" || raw === "off") return false;
  }
  const tier = getEffectiveTier(org);
  return FEATURE_ALLOWED_TIERS[feature].includes(tier);
}

export function assertFeatureAllowed(org: Organization | null | undefined, feature: FeatureKey): void {
  if (canUseFeature(org, feature)) return;
  throw new PlanGateError("Recurso disponível apenas para planos Pro/Business.");
}

export function assertCanCreateBoard(org: Organization | null | undefined, currentCount: number): void {
  const cap = getBoardCap(org);
  if (cap === null) return;
  if (currentCount >= cap) {
    throw new PlanGateError(`Limite do plano: no máximo ${cap} board(s).`, 403);
  }
}

export function assertCanCreateUser(org: Organization | null | undefined, currentCount: number): void {
  const cap = getUserCap(org);
  if (cap === null) return;
  if (currentCount >= cap) {
    throw new PlanGateError(`Limite do plano: no máximo ${cap} usuário(s).`, 403);
  }
}

function parsePositiveInt(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

/**
 * Limite de "calls/dia" para endpoints que chamam IA (Together.ai).
 * Free: 3 (por padrão) | Pro/Business: ilimitado (null).
 */
export function getDailyAiCallsCap(org: Organization | null | undefined): number | null {
  const tier = getEffectiveTier(org);
  if (tier !== "free") return null;
  return (
    parsePositiveInt(process.env.FLUX_FREE_CALLS_PER_DAY) ??
    parsePositiveInt(process.env.NEXT_PUBLIC_FLUX_FREE_CALLS_PER_DAY) ??
    3
  );
}

export function makeDailyAiCallsRateLimitKey(orgId: string): string {
  return `ai_calls:daily:org:${orgId}`;
}

export function getDailyAiCallsWindowMs(): number {
  return DAY_MS;
}

