import { assertJwtSecretConfigured } from "./jwt-secret";

let validated = false;

/**
 * Validação central de ambiente no boot (Node).
 * JWT é obrigatório via `assertJwtSecretConfigured` (sem fallback literal).
 */
export function validateServerEnv(): void {
  if (validated) return;
  validated = true;

  assertJwtSecretConfigured();

  if (process.env.NODE_ENV === "production") {
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
  }
}
