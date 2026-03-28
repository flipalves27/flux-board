import { NextRequest } from "next/server";
import { getAuthFromRequest } from "./auth";
import { getOrganizationById } from "./kv-organizations";
import { getEffectiveTier, planGateCtxFromAuthPayload } from "./plan-gates";
import { logRateLimitAbuse } from "./rate-limit-abuse";
import { rateLimitHeadersFromResult, slidingRateLimitConsume } from "./sliding-rate-limit";

const WINDOW_MS = 60_000;

/** Free: 30/min | Pro/Business: 120/min */
export const RL_AI_FREE_PER_MIN = Number(process.env.FLUX_RL_AI_FREE_PER_MIN) || 30;
export const RL_AI_PRO_PER_MIN = Number(process.env.FLUX_RL_AI_PRO_PER_MIN) || 120;
export const RL_AUTH_API_PER_MIN = Number(process.env.FLUX_RL_AUTH_API_PER_MIN) || 300;
export const RL_PUBLIC_PER_MIN = Number(process.env.FLUX_RL_PUBLIC_PER_MIN) || 60;

export type RateLimitCategory = "ai" | "authenticated" | "public" | "skipped";

const SKIP_PATH_PREFIXES = ["/api/internal/rate-limit-check", "/api/billing/webhook"];

const AI_PATH_TESTS: RegExp[] = [
  /^\/api\/boards\/[^/]+\/copilot$/,
  /^\/api\/boards\/[^/]+\/nlq$/,
  /^\/api\/boards\/[^/]+\/card-context$/,
  /^\/api\/boards\/[^/]+\/daily-insights$/,
  /^\/api\/boards\/[^/]+\/automations\/interpret$/,
  /^\/api\/boards\/[^/]+\/transcribe$/,
  /^\/api\/docs\/generate-pipeline$/,
  /^\/api\/flux-reports\/explain$/,
  /^\/api\/forms\/[^/]+$/,
  /^\/api\/templates\/ai-generate$/,
  /^\/api\/weekly-digest$/,
];

function isAiPath(pathname: string): boolean {
  return AI_PATH_TESTS.some((re) => re.test(pathname));
}

function shouldSkipPath(pathname: string): boolean {
  return SKIP_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function cronSecretsConfigured(): string[] {
  return [process.env.AUTOMATION_CRON_SECRET, process.env.WEEKLY_DIGEST_SECRET, process.env.ANOMALY_CRON_SECRET].filter(
    (s): s is string => Boolean(s)
  );
}

function shouldSkipCron(pathname: string, cronSecret: string | null): boolean {
  if (!pathname.startsWith("/api/cron/")) return false;
  const secrets = cronSecretsConfigured();
  if (secrets.length === 0) return true;
  return Boolean(cronSecret && secrets.includes(cronSecret));
}

function buildAuthRequest(authHeader: string | null, cookieHeader: string | null): NextRequest {
  const h = new Headers();
  if (authHeader) h.set("authorization", authHeader);
  if (cookieHeader) h.set("cookie", cookieHeader);
  return new NextRequest("http://internal/rl", { headers: h });
}

export type GlobalApiRateLimitInput = {
  pathname: string;
  method: string;
  /** IP já normalizado pelo middleware (fonte: request original). */
  clientIp: string;
  authHeader: string | null;
  /** Cookie header bruto (ex.: flux_access para JWT em cookie httpOnly). */
  cookieHeader: string | null;
  cronSecretHeader: string | null;
};

export type GlobalApiRateLimitResult =
  | { ok: true; category: RateLimitCategory; headers: Record<string, string> }
  | {
      ok: false;
      category: RateLimitCategory;
      headers: Record<string, string>;
      retryAfterSeconds: number;
      message: string;
    };

export async function runGlobalApiRateLimit(input: GlobalApiRateLimitInput): Promise<GlobalApiRateLimitResult> {
  const pathname = input.pathname;
  const method = input.method.toUpperCase();

  if (method === "OPTIONS" || shouldSkipPath(pathname) || shouldSkipCron(pathname, input.cronSecretHeader)) {
    return { ok: true, category: "skipped", headers: {} };
  }

  const payload = await getAuthFromRequest(buildAuthRequest(input.authHeader, input.cookieHeader));
  const ip = input.clientIp || "unknown";

  let category: RateLimitCategory;
  let key: string;
  let limit: number;
  let orgForMessage: Awaited<ReturnType<typeof getOrganizationById>> = null;

  if (isAiPath(pathname)) {
    category = "ai";
    if (payload) {
      orgForMessage = await getOrganizationById(payload.orgId);
      const tier = getEffectiveTier(orgForMessage, planGateCtxFromAuthPayload(payload));
      limit = tier === "free" ? RL_AI_FREE_PER_MIN : RL_AI_PRO_PER_MIN;
      key = `mw:sliding:ai:user:${payload.id}:org:${payload.orgId}`;
    } else {
      limit = RL_AI_FREE_PER_MIN;
      key = `mw:sliding:ai:ip:${ip}`;
    }
  } else if (payload) {
    category = "authenticated";
    limit = RL_AUTH_API_PER_MIN;
    key = `mw:sliding:api:user:${payload.id}`;
  } else {
    category = "public";
    limit = RL_PUBLIC_PER_MIN;
    key = `mw:sliding:pub:ip:${ip}`;
  }

  const rl = await slidingRateLimitConsume({ key, limit, windowMs: WINDOW_MS });
  const baseHeaders = rateLimitHeadersFromResult(rl);

  if (!rl.allowed) {
    const identifier =
      category === "public" || (category === "ai" && !payload) ? `ip:${ip}` : `user:${payload?.id ?? ip}`;
    void logRateLimitAbuse({
      category,
      identifier,
      pathname,
      ip,
      userId: payload?.id,
    }).catch(() => {});

    const retry = rl.retryAfterSeconds;
    const headers = {
      ...baseHeaders,
      "Retry-After": String(retry),
    };
    const tierLabel =
      category === "ai" && payload
        ? getEffectiveTier(orgForMessage, planGateCtxFromAuthPayload(payload)) === "free"
          ? "Free"
          : "Pro/Business"
        : "";
    const message =
      category === "ai"
        ? `Limite de requisições de IA atingido (${limit}/min${tierLabel ? `, plano ${tierLabel}` : ""}). Tente novamente em ${retry}s.`
        : category === "authenticated"
          ? `Limite da API atingido (${limit} requisições/min por usuário). Tente novamente em ${retry}s.`
          : `Limite de requisições públicas atingido (${limit}/min por IP). Tente novamente em ${retry}s.`;

    return { ok: false, category, headers, retryAfterSeconds: retry, message };
  }

  return { ok: true, category, headers: baseHeaders };
}
