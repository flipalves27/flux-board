/** `sessionStorage`: última falha de validação de sessão (para mostrar em `/login` após qualquer redirect). */
export const FLUX_SESSION_FAILURE_STORAGE_KEY = "flux_session_failure_diag";

/** JSON seguro para partilhar com suporte: sem cookies, tokens ou e-mail. */
export type FluxSessionDiagnosticPayload = {
  fluxSessionSupportRef: string;
  failureKind: string;
  capturedAtIso: string;
  origin: string;
  pathname: string;
  userAgent: string;
};

export function buildFluxSessionDiagnosticPayload(
  supportRef: string,
  failureKind: string,
  nav?: Pick<Window, "location"> & { navigator?: Pick<Navigator, "userAgent"> }
): FluxSessionDiagnosticPayload {
  return {
    fluxSessionSupportRef: supportRef,
    failureKind,
    capturedAtIso: new Date().toISOString(),
    origin: nav?.location?.origin ?? "",
    pathname: nav?.location?.pathname ?? "",
    userAgent: nav?.navigator?.userAgent ?? "",
  };
}
