import type { Organization } from "./kv-organizations";
import { isProTenant } from "./commercial-plan";
import { getFreeMaxBoards, getFreeMaxUsers } from "./billing-limits";
import { writeSecurityAudit } from "./security-audit";
import { deriveEffectiveRoles, isOrgGestor, isPlatformAdmin, type OrgRole, type PlatformRole } from "./rbac";

/**
 * Tier de produto é sempre por organização (`Organization.plan`, Stripe, trial).
 * Bypass de plano:
 * - `isPlatformAdmin`: usuário seed / platform_admin — fora do contexto comercial Stripe; tier máximo (Business).
 * - `isOrgAdmin`: gestor da org — mesmo tier máximo só se `FLUX_ADMIN_SUPERPOWERS=1` (default desligado).
 * Ver `lib/plan-product.ts` para o mapa canônico de produto e prefixos de API.
 */

/** Audit log retention for Free tier (days). Pro/Business: unlimited (no TTL window). */
const BOARD_ACTIVITY_FREE_RETENTION_DAYS = 90;

/** Plano efetivo para gates (trial ativo conta como Pro; grace pós-downgrade mantém tier pago). */
export type EffectiveGateTier = "free" | "pro" | "business";

export type PlanGateContext = {
  /** Administrador da plataforma; bypass total, independente de Stripe. */
  isPlatformAdmin?: boolean;
  /** Admin ou executivo da organização; bypass só com FLUX_ADMIN_SUPERPOWERS. */
  isOrgAdmin?: boolean;
};

export type PlanGateAuthPayload = {
  id: string;
  isAdmin?: boolean;
  isExecutive?: boolean;
  platformRole?: PlatformRole;
  orgRole?: OrgRole;
};

/** Contexto a partir do payload de `getAuthFromRequest` (ou JWT + mesmo shape no cliente). */
export function planGateCtxFromAuthPayload(payload: PlanGateAuthPayload): PlanGateContext | undefined {
  const roles = deriveEffectiveRoles(payload);
  const platform = isPlatformAdmin(roles);
  const orgElevated = isOrgGestor(roles) && !platform;
  if (!platform && !orgElevated) return undefined;
  return {
    ...(platform ? { isPlatformAdmin: true as const } : {}),
    ...(orgElevated ? { isOrgAdmin: true as const } : {}),
  };
}

export type Tier = Organization["plan"];

export type PlanGateCode = "PLAN_UPGRADE_REQUIRED" | "PLAN_LIMIT_REACHED";

const PAID: EffectiveGateTier[] = ["pro", "business"];
const BIZ_UP: EffectiveGateTier[] = ["business"];
/** Free + paid — tier oneshot (card → draft PR) per product spec. */
const ALLTIERS: EffectiveGateTier[] = ["free", "pro", "business"];

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
  | "lss_ai_premium"
  | "safe_ai_premium"
  | "spec_ai_scope_planner"
  | "board_pdf_list_import"
  | "ai_agent_autonomy"
  | "org_digital_twin"
  | "mcp_hub_gateway"
  | "okr_auto_prioritization"
  | "org_kaizen_engine"
  | "project_governance"
  | "project_roadmap"
  | "project_financials"
  | "project_ai"
  | "forge_oneshot"
  | "forge_tested"
  | "forge_autonomous";

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
  anomaly_webhook: BIZ_UP,
  org_chat: BIZ_UP,
  retro_facilitator: BIZ_UP,
  workload_balancer: BIZ_UP,
  risk_score: PAID,
  scope_creep_alert: PAID,
  knowledge_graph: BIZ_UP,
  sso_saml: BIZ_UP,
  custom_domain: BIZ_UP,
  white_label_full: BIZ_UP,
  api_webhook_unlimited: BIZ_UP,
  copilot_tools_custom: BIZ_UP,
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
  safe_ai_premium: BIZ_UP,
  spec_ai_scope_planner: BIZ_UP,
  board_pdf_list_import: PAID,
  ai_agent_autonomy: BIZ_UP,
  org_digital_twin: BIZ_UP,
  mcp_hub_gateway: BIZ_UP,
  okr_auto_prioritization: BIZ_UP,
  org_kaizen_engine: PAID,
  project_governance: PAID,
  project_roadmap: PAID,
  project_financials: BIZ_UP,
  project_ai: BIZ_UP,
  forge_oneshot: ALLTIERS,
  forge_tested: BIZ_UP,
  forge_autonomous: BIZ_UP,
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

/** Bypass comercial para admin/executivo da org (não aplica ao platform_admin). Default: desligado. */
function adminSuperpowersEnabled(): boolean {
  return envEnabled(process.env.FLUX_ADMIN_SUPERPOWERS, false);
}

const orgSuperpowerTierAuditAt = new Map<string, number>();
const ORG_SUPERPOWER_TIER_AUDIT_MS = 60_000;

function auditOrgSuperpowerTierElevation(org: Organization | null | undefined): void {
  const orgId = org?._id ?? "unknown";
  const now = Date.now();
  const prev = orgSuperpowerTierAuditAt.get(orgId) ?? 0;
  if (now - prev < ORG_SUPERPOWER_TIER_AUDIT_MS) return;
  orgSuperpowerTierAuditAt.set(orgId, now);
  writeSecurityAudit({
    event: "org_admin_superpower_tier_elevation",
    orgId,
    details: { effectiveTier: "business", source: "getEffectiveTier" },
  });
}

function getTierWithoutAdminBypass(org: Organization | null | undefined): EffectiveGateTier {
  return getEffectiveTier(org, undefined);
}

export function getEffectiveTier(org: Organization | null | undefined, ctx?: PlanGateContext): EffectiveGateTier {
  if (ctx?.isPlatformAdmin) return "business";
  if (ctx?.isOrgAdmin && adminSuperpowersEnabled()) {
    auditOrgSuperpowerTierElevation(org);
    return "business";
  }
  if (isProTenant()) return "pro";
  const plan = org?.plan ?? "free";

  if (plan === "trial" && org?.trialEndsAt) {
    const end = new Date(org.trialEndsAt).getTime();
    if (Number.isFinite(end) && end > Date.now()) return "pro";
  }

  if (plan === "free" && org?.downgradeGraceEndsAt) {
    const g = new Date(org.downgradeGraceEndsAt).getTime();
    if (Number.isFinite(g) && g > Date.now()) {
      return org.downgradeFromTier === "business" ? "business" : "pro";
    }
  }

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
  { key: "safe_ai_premium", label: "Assistente SAFe aproximado (IA)" },
  { key: "spec_ai_scope_planner", label: "Planejamento de escopo por documento (IA)" },
  { key: "board_pdf_list_import", label: "Importar lista a partir de PDF (IA)" },
  { key: "project_governance", label: "Projetos: governança e estratégia" },
  { key: "project_roadmap", label: "Projetos: roadmap e cronograma" },
  { key: "project_financials", label: "Projetos: custos e forecast" },
  { key: "project_ai", label: "Project Copilot e simulações" },
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
    const raw = (process.env.FLUX_DOCS_ENABLED || "true").toLowerCase();
    if (raw === "false" || raw === "0" || raw === "off") return false;
  }
  if (feature === "flux_docs_rag") {
    const raw = (process.env.FLUX_DOCS_RAG_ENABLED || "true").toLowerCase();
    if (raw === "false" || raw === "0" || raw === "off") return false;
  }
  const tier = getEffectiveTier(org, ctx);
  const allowed = FEATURE_ALLOWED_TIERS[feature].includes(tier);
  if (allowed) {
    const baseTier = getTierWithoutAdminBypass(org);
    if (!FEATURE_ALLOWED_TIERS[feature].includes(baseTier)) {
      if (ctx?.isPlatformAdmin) {
        writeSecurityAudit({
          event: "platform_admin_bypass",
          orgId: org?._id ?? "unknown",
          details: {
            feature,
            baseTier,
            elevatedTier: tier,
          },
        });
      } else if (ctx?.isOrgAdmin && adminSuperpowersEnabled()) {
        writeSecurityAudit({
          event: "org_admin_superpower_bypass",
          orgId: org?._id ?? "unknown",
          details: {
            feature,
            baseTier,
            elevatedTier: tier,
          },
        });
      }
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
 * Limite de "calls/dia" para endpoints que chamam IA (motor OpenAI-compat).
 * Free: 3 (por padrão) | Pro/Business: ilimitado (null).
 */
export function getDailyAiCallsCap(org: Organization | null | undefined, ctx?: PlanGateContext): number | null {
  const tier = getEffectiveTier(org, ctx);
  if (tier !== "free") return null;
  return parsePositiveInt(process.env.FLUX_FREE_CALLS_PER_DAY) ?? 3;
}

export function makeDailyAiCallsRateLimitKey(orgId: string): string {
  return `ai_calls:daily:org:${orgId}`;
}

export function getDailyAiCallsWindowMs(): number {
  return DAY_MS;
}
