/** Limites compartilhados entre billing, KV e gates (sem inicializar Stripe). */

export const TRIAL_DAYS = 14;
export const DOWNGRADE_GRACE_DAYS = 7;
/** Pausa de cobrança oferecida no fluxo de cancelamento (dias). */
export const PAUSE_BILLING_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export function addDaysIso(days: number, from: Date = new Date()): string {
  return new Date(from.getTime() + days * DAY_MS).toISOString();
}

export function getFreeMaxBoards(): number {
  const fromEnv = Number(process.env.FLUX_FREE_MAX_BOARDS ?? "");
  if (Number.isFinite(fromEnv) && fromEnv >= 1) return fromEnv;
  return 3;
}

export function getFreeMaxUsers(): number {
  const fromEnvLegacy = Number(process.env.FLUX_MAX_USERS_PER_ORG ?? "");
  if (Number.isFinite(fromEnvLegacy) && fromEnvLegacy >= 1) return fromEnvLegacy;
  const fromEnvFree = Number(process.env.FLUX_FREE_MAX_USERS_PER_ORG ?? "");
  if (Number.isFinite(fromEnvFree) && fromEnvFree >= 1) return fromEnvFree;
  return 1;
}

export function getProMaxUsers(): number {
  const fromEnv = Number(process.env.FLUX_PRO_MAX_USERS_PER_ORG ?? "");
  if (Number.isFinite(fromEnv) && fromEnv >= 1) return fromEnv;
  return 10;
}

export function getBusinessMaxUsers(): number {
  const fromEnv = Number(process.env.FLUX_BUSINESS_MAX_USERS_PER_ORG ?? "");
  if (Number.isFinite(fromEnv) && fromEnv >= 1) return fromEnv;
  return 1_000_000;
}

export function getPaidMaxBoards(): number {
  const fromEnv = Number(process.env.FLUX_PAID_MAX_BOARDS ?? "");
  if (Number.isFinite(fromEnv) && fromEnv >= 1) return fromEnv;
  return 1_000_000;
}
