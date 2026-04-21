/**
 * Limites e sinalização de plano para freemium / go-to-market.
 * Sem variáveis de ambiente = sem limite (comportamento atual).
 */

function parsePositiveInt(raw: string | undefined): number | null {
  if (raw === undefined || raw === "") return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

/** Máximo de boards por usuário não-admin; null = ilimitado. */
export function maxBoardsPerUser(): number | null {
  return parsePositiveInt(process.env.FLUX_MAX_BOARDS_PER_USER);
}

export function isProTenant(): boolean {
  const v = (process.env.FLUX_PRO_TENANT || "").toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}
