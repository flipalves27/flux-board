import { assertJwtSecretConfigured } from "./jwt-secret";

let validated = false;

function isNextCompilerBuildPhase(): boolean {
  const p = process.env.NEXT_PHASE ?? "";
  return p === "phase-production-build" || p === "phase-development-build";
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
    const superRaw = process.env.FLUX_ADMIN_SUPERPOWERS?.trim().toLowerCase();
    if (superRaw === "1" || superRaw === "true" || superRaw === "on") {
      console.warn(
        "[env] FLUX_ADMIN_SUPERPOWERS ativo — admins/executivos da org ignoram limites de plano (Stripe). Use só se necessário."
      );
    }
  }
}
