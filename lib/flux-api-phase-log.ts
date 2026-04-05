/**
 * Opt-in timing logs for API hot paths (cold start / burst debugging).
 * Enable: FLUX_API_PHASE_LOG=1 (Vercel / local).
 *
 * **Staging — Mongo `explain("executionStats")`:** com `mongosh` na base da org, validar:
 * - `db.boards.find({ _id: "b_1", orgId: "…" }).explain("executionStats")` (usa `{ orgId: 1, _id: 1 }`);
 * - agregação de `getBoardListRowsByIds` (match + `$project` em `cards`);
 * - agregação org-wide em `user_boards` (`$match` + `$unwind` + `$group`) para comparar com `countDocuments({ orgId })`.
 * Script de referência: `npm run mongo:explain-staging` (imprime pipelines sugeridos).
 */
export function fluxApiPhaseLogEnabled(): boolean {
  const v = process.env.FLUX_API_PHASE_LOG?.trim();
  return v === "1" || v?.toLowerCase() === "true";
}

export function logFluxApiPhase(route: string, phase: string, startedAt: number): void {
  if (!fluxApiPhaseLogEnabled()) return;
  console.info(`[flux-api-phase] ${route} ${phase} ms=${Date.now() - startedAt}`);
}
