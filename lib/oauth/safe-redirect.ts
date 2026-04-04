/**
 * Caminho relativo seguro pós-OAuth. Rejeita open redirect (`//outro.host`, schemes, etc.).
 */
export function sanitizeOAuthReturnPath(redirect: string | undefined): string | undefined {
  if (redirect == null) return undefined;
  const t = redirect.trim();
  if (!t.startsWith("/")) return undefined;
  if (t.startsWith("//")) return undefined;
  if (/[\r\n\0]/.test(t)) return undefined;
  if (t.includes("://")) return undefined;
  if (t.includes("\\")) return undefined;
  return t;
}
