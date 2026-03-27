import type { Organization } from "./kv-organizations";
import { isProTenant } from "./commercial-plan";
import { getFreeMaxBoards, getFreeMaxUsers } from "./billing-limits";
import { writeSecurityAudit } from "./security-audit";

/** Audit log retention for Free tier (days). Pro/Business: unlimited (no TTL window). */
const BOARD_ACTIVITY_FREE_RETENTION_DAYS = 90;

/** Plano efetivo para gates (trial ativo conta como Pro; grace pós-downgrade mantém tier pago). */
export type EffectiveGateTier = "free" | "pro" | "business" | "enterprise";

/**
 * Admin (`isAdmin`) ou executivo (`isExecutive`) da organização: desvinculados de Stripe/plano —
 * tier efetivo **enterprise** para liberar funcionalidades e limites (boards/usuários/IA).
 */
export type PlanGateContext = {
  isOrgAdmin?: boolean;
};

/** Monta contexto a partir do JWT/DB (rotas autenticadas). */
export function planGateCtxForAuth(
  isAdmin: boolean | undefined,
  isExecutive?: boolean | undefined
): PlanGateContext | undefined {
  return isAdmin || isExecutive ? { isOrgAdmin: true } : undefined;
}

export type Tier = Organization["plan"];

export type PlanGateCode = "PLAN_UPGRADE_REQUIRED" | "PLAN_LIMIT_REACHED";

const PAID: EffectiveGateTier[] = ["pro", "business", "enterprise"];
const BIZ_UP: EffectiveGateTier[] = ["business", "enterprise"];
const ENT_ONLY: EffectiveGateTier[] = ["enterprise"];

export type FeatureKey =
  | "executive_brief"
  | "card_context"
  | "daily_insights"
  | "portfolio_export"
  | "board_copilot"
  | "okr_engine"
  | "flux_docs"
  | "flux_docs_rag"
  | "anomaly_email"
  | "anomaly_webhook"
  | "org_chat"
  | "retro_facilitator"
  | "workload_balancer"
  | "risk_score"
  | "scope_creep_alert"
  | "knowledge_graph"
  | "sso_saml"
  | "custom_domain"
  | "white_label_full"
  | "api_webhook_unlimited"
  | "copilot_tools_custom"
  // v5 roadmap features
  | "sprint_engine"
  | "ceremonies"
  | "subtasks"
  | "time_tracking"
  | "card_comments"
  | "ai_card_writer"
  | "dependency_graph_visual"
  | "portfolio_sprint"
  | "flux_workflows_visual"
  | "board_health_score"
  | "lss_executive_reports"
  | "lss_ai_premium";

const FEATURE_ALLOWED_TIERS: Record<FeatureKey, EffectiveGateTier[]> = {
  executive_brief: PAID,
  card_context: PAID,
  daily_insights: PAID,
  portfolio_export: PAID,
  board_copilot: PAID,
  okr_engine: PAID,
  flux_docs: PAID,
  flux_docs_rag: PAID,
  anomaly_email: BIZ_UP,
  anomaly_webhook: ENT_ONLY,
  org_chat: BIZ_UP,
  retro_facilitator: BIZ_UP,
  workload_balancer: BIZ_UP,
  risk_score: PAID,
  scope_creep_alert: PAID,
  knowledge_graph: BIZ_UP,
  sso_saml: ENT_ONLY,
  custom_domain: ENT_ONLY,
  white_label_full: BIZ_UP,
  api_webhook_unlimited: BIZ_UP,
  copilot_tools_custom: ENT_ONLY,
  // v5 roadmap features
  sprint_engine: PAID,
  ceremonies: BIZ_UP,
  subtasks: PAID,
  time_tracking: PAID,
  card_comments: PAID,
  ai_card_writer: PAID,
  dependency_graph_visual: BIZ_UP,
  portfolio_sprint: BIZ_UP,
  flux_workflows_visual: BIZ_UP,
  board_health_score: BIZ_UP,
  lss_executive_reports: BIZ_UP,
  lss_ai_premium: BIZ_UP,
};

/** Matriz canônica para UI/backend (fonte única da política de planos). */
export const PLAN_FEATURE_MATRIX = FEATURE_ALLOWED_TIERS;

const DAY_MS = 24 * 60 * 60 * 1000;

export class PlanGateError extends Error {
  status: number;
  code: PlanGateCode;
  feature?: FeatureKey;
  requiredTiers?: EffectiveGateTier[];
  currentTier?: EffectiveGateTier;
  constructor(
    message: string,
    status = 403,
    code: PlanGateCode = "PLAN_UPGRADE_REQUIRED",
    details?: { feature?: FeatureKey; requiredTiers?: EffectiveGateTier[]; currentTier?: EffectiveGateTier }
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.feature = details?.feature;
    this.requiredTiers = details?.requiredTiers;
    this.currentTier = details?.currentTier;
  }
}

function envEnabled(raw: string | undefined, fallback: boolean): boolean {
  if (raw == null) return fallback;
  const v = raw.trim().toLowerCase();
  if (!v) return fallback;
  return !(v === "0" || v === "false" || v === "off" || v === "no");
}

function adminSuperpowersEnabled(): boolean {
  return envEnabled(process.env.FLUX_ADMIN_SUPERPOWERS, true);
}

function getTierWithoutAdminBypass(org: Organization | null | undefined): EffectiveGateTier {
  return getEffectiveTier(org, undefined);
}

export function getEffectiveTier(org: Organization | null | undefined, ctx?: PlanGateContext): EffectiveGateTier {
  if (ctx?.isOrgAdmin && adminSuperpowersEnabled()) return "enterprise";
  if (isProTenant()) return "pro";
  const plan = org?.plan ?? "free";

  if (plan === "trial" && org?.trialEndsAt) {
    const end = new Date(org.trialEndsAt).getTime();
    if (Number.isFinite(end) && end > Date.now()) return "pro";
  }

  if (plan === "free" && org?.downgradeGraceEndsAt) {
    const g = new Date(org.downgradeGraceEndsAt).getTime();
    if (Number.isFinite(g) && g > Date.now()) {
      if (org.downgradeFromTier === "enterprise") return "business";
      return org.downgradeFromTier === "business" ? "business" : "pro";
    }
  }

  if (plan === "enterprise") return "enterprise";
  if (plan === "pro" || plan === "business") return plan;

  return "free";
}

/** Rótulos para UI de downgrade / trial expirado (PT). */
export const PRO_FEATURE_LABELS_PT: { key: FeatureKey; label: string }[] = [
  { key: "executive_brief", label: "Executive Brief" },
  { key: "card_context", label: "Card Context (IA)" },
  { key: "daily_insights", label: "Daily Insights" },
  { key: "portfolio_export", label: "Portfolio export" },
  { key: "board_copilot", label: "Board Copilot" },
  { key: "okr_engine", label: "OKR engine" },
  { key: "flux_docs", label: "Flux Docs" },
  { key: "flux_docs_rag", label: "Flux Docs RAG" },
  { key: "lss_executive_reports", label: "Relatórios executivos Lean Six Sigma" },
  { key: "lss_ai_premium", label: "IA C-level Lean Six Sigma" },
];

export function describeDowngradeImpact(params: {
  boardsCount: number;
  usersCount: number;
}): { lostFeatures: string[]; boardsOver: number; usersOver: number; freeMaxBoards: number; freeMaxUsers: number } {
  const freeMaxBoards = getFreeMaxBoards();
  const freeMaxUsers = getFreeMaxUsers();
  return {
    lostFeatures: PRO_FEATURE_LABELS_PT.map((x) => x.label),
    boardsOver: Math.max(0, params.boardsCount - freeMaxBoards),
    usersOver: Math.max(0, params.usersCount - freeMaxUsers),
    freeMaxBoards,
    freeMaxUsers,
  };
}

/** Free: 90 dias; Pro/Business: ilimitado (null). */
export function getBoardActivityRetentionDays(org: Organization | null | undefined, ctx?: PlanGateContext): number | null {
  const tier = getEffectiveTier(org, ctx);
  if (tier === "free") return BOARD_ACTIVITY_FREE_RETENTION_DAYS;
  return null;
}

export function getBoardCap(org: Organization | null | undefined, ctx?: PlanGateContext): number | null {
  const tier = getEffectiveTier(org, ctx);
  if (tier === "free") return org?.maxBoards ?? 3;
  return null; // Pro/Business: ilimitado
}

export function getUserCap(org: Organization | null | undefined, ctx?: PlanGateContext): number | null {
  const tier = getEffectiveTier(org, ctx);
  if (tier === "free") return org?.maxUsers ?? 1;
  return null; // Pro/Business: sem teto via `maxUsers` (gates bypass).
}

export function canUseFeature(org: Organization | null | undefined, feature: FeatureKey, ctx?: PlanGateContext): boolean {
  if (feature === "flux_docs") {
    const raw = (process.env.FLUX_DOCS_ENABLED || process.env.NEXT_PUBLIC_FLUX_DOCS_ENABLED || "true").toLowerCase();
    if (raw === "false" || raw === "0" || raw === "off") return false;
  }
  if (feature === "flux_docs_rag") {
    const raw = (process.env.FLUX_DOCS_RAG_ENABLED || process.env.NEXT_PUBLIC_FLUX_DOCS_RAG_ENABLED || "true").toLowerCase();
    if (raw === "false" || raw === "0" || raw === "off") return false;
  }
  const tier = getEffectiveTier(org, ctx);
  const allowed = FEATURE_ALLOWED_TIERS[feature].includes(tier);
  if (allowed && ctx?.isOrgAdmin && adminSuperpowersEnabled()) {
    const baseTier = getTierWithoutAdminBypass(org);
    if (!FEATURE_ALLOWED_TIERS[feature].includes(baseTier)) {
      writeSecurityAudit({
        event: "admin_superpower_bypass",
        orgId: org?._id ?? "unknown",
        details: {
          feature,
          baseTier,
          elevatedTier: tier,
        },
      });
    }
  }
  return allowed;
}

export function assertFeatureAllowed(
  org: Organization | null | undefined,
  feature: FeatureKey,
  ctx?: PlanGateContext
): void {
  if (canUseFeature(org, feature, ctx)) return;
  const currentTier = getEffectiveTier(org, ctx);
  throw new PlanGateError(
    "Upgrade de plano necessário para acessar este recurso.",
    402,
    "PLAN_UPGRADE_REQUIRED",
    {
      feature,
      requiredTiers: FEATURE_ALLOWED_TIERS[feature],
      currentTier,
    }
  );
}

export function assertCanCreateBoard(org: Organization | null | undefined, currentCount: number, ctx?: PlanGateContext): void {
  const cap = getBoardCap(org, ctx);
  if (cap === null) return;
  if (currentCount >= cap) {
    throw new PlanGateError(`Limite do plano: no máximo ${cap} board(s).`, 403, "PLAN_LIMIT_REACHED");
  }
}

export function assertCanCreateUser(org: Organization | null | undefined, currentCount: number, ctx?: PlanGateContext): void {
  const cap = getUserCap(org, ctx);
  if (cap === null) return;
  if (currentCount >= cap) {
    throw new PlanGateError(`Limite do plano: no máximo ${cap} usuário(s).`, 403, "PLAN_LIMIT_REACHED");
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
export function getDailyAiCallsCap(org: Organization | null | undefined, ctx?: PlanGateContext): number | null {
  const tier = getEffectiveTier(org, ctx);
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

