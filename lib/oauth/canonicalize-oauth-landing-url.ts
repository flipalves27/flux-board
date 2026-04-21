export type CanonicalizeOAuthLandingUrlOpts = {
  nextPublicAppUrl?: string;
  authCookieDomain?: string;
};

/**
 * Alinha o host da URL de destino pós-OAuth a `NEXT_PUBLIC_APP_URL` só quando existe
 * `AUTH_COOKIE_DOMAIN` — caso contrário os cookies desta resposta são host-only e mudar
 * o hostname no `Location` quebra a sessão.
 */
export function canonicalizeOAuthSessionLandingUrl(
  targetUrl: string,
  opts: CanonicalizeOAuthLandingUrlOpts
): string {
  const canonical = opts.nextPublicAppUrl?.trim().replace(/\/$/, "");
  if (!canonical) return targetUrl;
  if (!opts.authCookieDomain?.trim()) return targetUrl;
  try {
    const target = new URL(targetUrl);
    const canon = new URL(canonical);
    if (target.hostname !== canon.hostname) {
      target.hostname = canon.hostname;
      target.protocol = canon.protocol;
      return target.toString();
    }
  } catch {
    /* manter URL original */
  }
  return targetUrl;
}
