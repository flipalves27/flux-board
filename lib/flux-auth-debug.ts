/**
 * Opt-in diagnostics for OAuth / session cookie issues (host mismatch, missing cookies).
 * Set `FLUX_AUTH_DEBUG=1` — never log tokens or raw Cookie headers.
 */
export function isFluxAuthDebugEnabled(): boolean {
  const v = process.env.FLUX_AUTH_DEBUG?.trim().toLowerCase();
  return v === "1" || v === "true";
}

export function logFluxAuthDebug(event: string, payload: Record<string, unknown>): void {
  if (!isFluxAuthDebugEnabled()) return;
  console.log("[flux-auth-debug]", JSON.stringify({ event, ...payload }));
}
