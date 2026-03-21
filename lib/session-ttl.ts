/** TTL do access JWT e do cookie `flux_access` (segundos). */
export function accessTokenExpiresSeconds(): number {
  const raw = process.env.JWT_ACCESS_EXPIRES_SEC;
  const n = raw != null ? Number(raw) : NaN;
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return 15 * 60;
}

/**
 * maxAge do cookie de refresh. `undefined` = cookie de sessão (fecha o navegador).
 */
export function refreshCookieMaxAgeSec(remember: boolean): number | undefined {
  if (!remember) return undefined;
  const raw = process.env.JWT_REFRESH_EXPIRES_SEC;
  const n = raw != null ? Number(raw) : NaN;
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return 7 * 24 * 60 * 60;
}

/**
 * Expiração do registro de refresh no armazenamento (sempre com TTL finito para limpeza).
 * Modo "sessão" usa janela curta no servidor mesmo com cookie de sessão no browser.
 */
export function refreshRecordExpiresSeconds(persistent: boolean): number {
  if (!persistent) return 24 * 60 * 60;
  const raw = process.env.JWT_REFRESH_EXPIRES_SEC;
  const n = raw != null ? Number(raw) : NaN;
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return 7 * 24 * 60 * 60;
}

export function refreshRecordExpiresAt(persistent: boolean): Date {
  return new Date(Date.now() + refreshRecordExpiresSeconds(persistent) * 1000);
}
