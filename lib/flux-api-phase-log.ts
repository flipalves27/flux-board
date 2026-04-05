/**
 * Opt-in timing logs for API hot paths (cold start / burst debugging).
 * Enable: FLUX_API_PHASE_LOG=1 (Vercel / local).
 */
export function fluxApiPhaseLogEnabled(): boolean {
  const v = process.env.FLUX_API_PHASE_LOG?.trim();
  return v === "1" || v?.toLowerCase() === "true";
}

export function logFluxApiPhase(route: string, phase: string, startedAt: number): void {
  if (!fluxApiPhaseLogEnabled()) return;
  console.info(`[flux-api-phase] ${route} ${phase} ms=${Date.now() - startedAt}`);
}
