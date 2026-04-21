/**
 * Caminho relativo seguro pós-OAuth / pós-login. Rejeita open redirect (`//outro.host`, schemes, etc.).
 * Rejeita `/api/*`: são route handlers (JSON), não páginas — navegar para elas após login resulta em 404 no browser.
 */
export function sanitizeOAuthReturnPath(redirect: string | undefined): string | undefined {
  if (redirect == null) return undefined;
  const t = redirect.trim();
  if (!t.startsWith("/")) return undefined;
  if (t.startsWith("//")) return undefined;
  if (/[\r\n\0]/.test(t)) return undefined;
  if (t.includes("://")) return undefined;
  if (t.includes("\\")) return undefined;
  if (/^\/api(\/|$)/i.test(t)) return undefined;
  return t;
}
