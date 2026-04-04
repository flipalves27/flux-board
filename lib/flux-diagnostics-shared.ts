/** Chave em sessionStorage / localStorage para ativar o painel de diagnóstico. */
export const FLUX_DIAG_STORAGE_KEY = "fluxDiag";

/**
 * Lê se o modo diagnóstico está ativo (?fluxDebug=1 grava em sessionStorage).
 */
export function readFluxDiagEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("fluxDebug") === "1") {
      sessionStorage.setItem(FLUX_DIAG_STORAGE_KEY, "1");
    }
    return (
      sessionStorage.getItem(FLUX_DIAG_STORAGE_KEY) === "1" ||
      localStorage.getItem(FLUX_DIAG_STORAGE_KEY) === "1"
    );
  } catch {
    return false;
  }
}
