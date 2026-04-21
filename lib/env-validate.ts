import { assertJwtSecretConfigured } from "./jwt-secret";
import { parseOAuthAllowedPublicOriginsFromEnv } from "./oauth/allowed-public-origins";

let validated = false;

function isNextCompilerBuildPhase(): boolean {
  const p = process.env.NEXT_PHASE ?? "";
  return p === "phase-production-build" || p === "phase-development-build";
}

function productionOAuthConfigured(): boolean {
  const g =
    Boolean(process.env.AUTH_GOOGLE_CLIENT_ID?.trim()) && Boolean(process.env.AUTH_GOOGLE_CLIENT_SECRET?.trim());
  const m =
    Boolean(process.env.AUTH_MICROSOFT_CLIENT_ID?.trim()) &&
    Boolean(process.env.AUTH_MICROSOFT_CLIENT_SECRET?.trim());
  return g || m;
}

/**
 * Validação central de ambiente no boot (Node).
 * JWT é obrigatório via `assertJwtSecretConfigured` (sem fallback literal).
 */
export function validateServerEnv(): void {
  if (validated) return;
  validated = true;

  assertJwtSecretConfigured();

  if (
    process.env.VERCEL_ENV === "production" &&
    process.env.NEXT_PUBLIC_VERCEL_BYPASS_SECRET?.trim()
  ) {
    throw new Error(
      "[env] NEXT_PUBLIC_VERCEL_BYPASS_SECRET não pode estar definido quando VERCEL_ENV=production."
    );
  }

  if (process.env.NODE_ENV === "production" && !isNextCompilerBuildPhase()) {
    if (!process.env.ADMIN_INITIAL_PASSWORD?.trim()) {
      throw new Error(
        "[env] ADMIN_INITIAL_PASSWORD é obrigatório em produção (password inicial do utilizador admin seed)."
      );
    }
    const stripe = process.env.STRIPE_SECRET_KEY?.trim();
    if (!stripe) {
      console.warn("[env] STRIPE_SECRET_KEY ausente — checkout e webhooks Stripe não funcionarão.");
    }
    const cronOk =
      Boolean(process.env.CRON_MASTER_SECRET?.trim()) ||
      Boolean(process.env.AUTOMATION_CRON_SECRET?.trim() && process.env.WEEKLY_DIGEST_SECRET?.trim());
    if (!cronOk) {
      console.warn(
        "[env] Defina CRON_MASTER_SECRET (recomendado) ou segredos específicos por job — crons negam em produção sem segredo."
      );
    }
    if (process.env.ALLOW_PUBLIC_BOARDS_CORS === "1") {
      console.warn("[env] ALLOW_PUBLIC_BOARDS_CORS=1 — CORS amplo em /api/boards; use só se necessário.");
    }
    if (!process.env.RATE_LIMIT_INTERNAL_SECRET?.trim()) {
      console.warn("[env] RATE_LIMIT_INTERNAL_SECRET ausente — rotas internas de rate-limit ficarão indisponíveis.");
    }
    if (!process.env.INTERNAL_HOST_RESOLVE_SECRET?.trim()) {
      console.warn("[env] INTERNAL_HOST_RESOLVE_SECRET ausente — resolução de domínio interno ficará indisponível.");
    }
    if (productionOAuthConfigured()) {
      if (!process.env.NEXT_PUBLIC_APP_URL?.trim()) {
        console.warn(
          "[env] NEXT_PUBLIC_APP_URL ausente com OAuth ativo — redirects e diagnósticos podem falhar; defina a URL canónica da app."
        );
      }
      if (!process.env.AUTH_COOKIE_DOMAIN?.trim()) {
        console.warn(
          "[env] AUTH_COOKIE_DOMAIN ausente com OAuth ativo — cookies de state OAuth podem não partilhar entre apex/www; defina o domínio do cookie (ex.: flux-board.com)."
        );
      }
      const allow = parseOAuthAllowedPublicOriginsFromEnv();
      if (!allow.ok || allow.origins.length === 0) {
        console.warn(
          "[env] OAUTH_ALLOWED_PUBLIC_ORIGINS vazio ou inválido com OAuth ativo — em produção a allowlist é obrigatória (CSV ou JSON de origins HTTPS)."
        );
      }
    }
    const superRaw = process.env.FLUX_ADMIN_SUPERPOWERS?.trim().toLowerCase();
    if (superRaw === "1" || superRaw === "true" || superRaw === "on") {
      console.warn(
        "[env] FLUX_ADMIN_SUPERPOWERS ativo — admins/executivos da org ignoram limites de plano (Stripe). Use só se necessário."
      );
    }
  }
}
