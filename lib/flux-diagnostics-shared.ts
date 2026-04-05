/**
 * Cliente apenas: o painel não expõe dados de servidor; operadores usam `?fluxDebug=1` com sessão platform_admin.
 * Chave em sessionStorage / localStorage para ativar o painel de diagnóstico.
 */
export const FLUX_DIAG_STORAGE_KEY = "fluxDiag";

export function clearFluxDiagStorage(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(FLUX_DIAG_STORAGE_KEY);
    localStorage.removeItem(FLUX_DIAG_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Lê apenas storage (sem efeitos no URL). */
export function readFluxDiagEnabledFromStorage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      sessionStorage.getItem(FLUX_DIAG_STORAGE_KEY) === "1" ||
      localStorage.getItem(FLUX_DIAG_STORAGE_KEY) === "1"
    );
  } catch {
    return false;
  }
}

/**
 * `?fluxDebug=1`: persiste em sessionStorage só quando `allowPersist` (operador plataforma).
 * Quando não permitido, remove a chave de sessionStorage para não armar o modo após visita ao URL.
 */
export function syncFluxDebugQueryParam(allowPersist: boolean): void {
  if (typeof window === "undefined") return;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("fluxDebug") === "1") {
      if (allowPersist) {
        sessionStorage.setItem(FLUX_DIAG_STORAGE_KEY, "1");
      } else {
        sessionStorage.removeItem(FLUX_DIAG_STORAGE_KEY);
      }
    }
  } catch {
    /* ignore */
  }
}

