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
  }
}
